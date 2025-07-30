// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "solidity-utils/contracts/libraries/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Address} from "solidity-utils/contracts/libraries/AddressLib.sol";
import {IBaseEscrow} from "../../../contracts/lib/cross-chain-swap/contracts/interfaces/IBaseEscrow.sol";

/**
 * @title RelayerContract for Tron
 * @notice Manages cross-chain order coordination and resolver interactions
 * @dev Compatible with Tron's TVM requirements
 */
contract RelayerContract is ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    struct Order {
        bytes32 orderId;
        address user;
        address srcToken;
        uint256 srcAmount;
        address dstToken;
        uint256 dstAmount;
        uint256 srcChainId;
        uint256 dstChainId;
        address resolver;
        uint256 createdAt;
        uint8 status; // 0=Created, 1=Committed, 2=SrcDeployed, 3=DstDeployed, 4=Completed, 5=Cancelled
        bytes32 secretHash;
        address srcEscrow;
        address dstEscrow;
    }
    
    struct ResolverProfile {
        bool isActive;
        uint256 totalVolume;
        uint256 successfulSwaps;
        uint256 failedSwaps;
        uint256 stakedAmount;
        uint256 lastActivityTime;
    }
    
    // State variables
    address public owner;
    uint256 public minResolverStake = 1000 * 1e6; // 1000 TRX (6 decimals on Tron)
    uint256 public orderTimeout = 1 hours;
    uint256 public resolverTimeout = 5 minutes;
    
    // Mappings
    mapping(bytes32 => Order) public orders;
    mapping(address => ResolverProfile) public resolvers;
    mapping(address => uint256) public userNonces;
    mapping(bytes32 => bool) public usedSecretHashes;
    
    // Events
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        address indexed resolver,
        uint256 srcAmount,
        uint256 dstAmount
    );
    event ResolverCommitted(bytes32 indexed orderId, address indexed resolver);
    event EscrowDeployed(bytes32 indexed orderId, bool isSrc, address escrow);
    event OrderCompleted(bytes32 indexed orderId, bytes32 secret);
    event OrderCancelled(bytes32 indexed orderId, string reason);
    event ResolverRegistered(address indexed resolver, uint256 stakedAmount);
    event ResolverDeactivated(address indexed resolver);
    event ResolverSlashed(address indexed resolver, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyActiveResolver() {
        require(resolvers[msg.sender].isActive, "Not active resolver");
        _;
    }
    
    modifier orderExists(bytes32 orderId) {
        require(orders[orderId].user != address(0), "Order not found");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @notice Register as a resolver by staking TRX
     */
    function registerResolver() external payable {
        require(msg.value >= minResolverStake, "Insufficient stake");
        require(!resolvers[msg.sender].isActive, "Already registered");
        
        resolvers[msg.sender] = ResolverProfile({
            isActive: true,
            totalVolume: 0,
            successfulSwaps: 0,
            failedSwaps: 0,
            stakedAmount: msg.value,
            lastActivityTime: block.timestamp
        });
        
        emit ResolverRegistered(msg.sender, msg.value);
    }
    
    /**
     * @notice Create a new cross-chain swap order
     */
    function createOrder(
        bytes32 orderId,
        address srcToken,
        uint256 srcAmount,
        address dstToken,
        uint256 dstAmount,
        uint256 dstChainId,
        bytes32 secretHash
    ) external nonReentrant {
        require(orders[orderId].user == address(0), "Order already exists");
        require(!usedSecretHashes[secretHash], "Secret hash already used");
        require(srcAmount > 0 && dstAmount > 0, "Invalid amounts");
        
        orders[orderId] = Order({
            orderId: orderId,
            user: msg.sender,
            srcToken: srcToken,
            srcAmount: srcAmount,
            dstToken: dstToken,
            dstAmount: dstAmount,
            srcChainId: block.chainid,
            dstChainId: dstChainId,
            resolver: address(0),
            createdAt: block.timestamp,
            status: 0,
            secretHash: secretHash,
            srcEscrow: address(0),
            dstEscrow: address(0)
        });
        
        usedSecretHashes[secretHash] = true;
        userNonces[msg.sender]++;
        
        emit OrderCreated(orderId, msg.sender, address(0), srcAmount, dstAmount);
    }
    
    /**
     * @notice Resolver commits to fulfill an order
     */
    function commitToOrder(bytes32 orderId) 
        external 
        orderExists(orderId)
        onlyActiveResolver
        nonReentrant 
    {
        Order storage order = orders[orderId];
        require(order.status == 0, "Order not available");
        require(order.createdAt + orderTimeout > block.timestamp, "Order expired");
        
        order.resolver = msg.sender;
        order.status = 1;
        
        resolvers[msg.sender].lastActivityTime = block.timestamp;
        
        emit ResolverCommitted(orderId, msg.sender);
    }
    
    /**
     * @notice Record source escrow deployment
     */
    function recordSrcEscrowDeployment(
        bytes32 orderId,
        address escrow
    ) external orderExists(orderId) {
        Order storage order = orders[orderId];
        require(order.resolver == msg.sender, "Not order resolver");
        require(order.status == 1, "Invalid order status");
        require(escrow != address(0), "Invalid escrow address");
        
        order.srcEscrow = escrow;
        order.status = 2;
        
        emit EscrowDeployed(orderId, true, escrow);
    }
    
    /**
     * @notice Record destination escrow deployment
     */
    function recordDstEscrowDeployment(
        bytes32 orderId,
        address escrow
    ) external orderExists(orderId) {
        Order storage order = orders[orderId];
        require(order.resolver == msg.sender, "Not order resolver");
        require(order.status == 2, "Invalid order status");
        require(escrow != address(0), "Invalid escrow address");
        
        order.dstEscrow = escrow;
        order.status = 3;
        
        emit EscrowDeployed(orderId, false, escrow);
    }
    
    /**
     * @notice Complete order after successful swap
     */
    function completeOrder(
        bytes32 orderId,
        bytes32 secret
    ) external orderExists(orderId) nonReentrant {
        Order storage order = orders[orderId];
        require(order.status == 3, "Order not ready for completion");
        require(keccak256(abi.encodePacked(secret)) == order.secretHash, "Invalid secret");
        
        order.status = 4;
        
        // Update resolver stats
        ResolverProfile storage resolver = resolvers[order.resolver];
        resolver.successfulSwaps++;
        resolver.totalVolume += order.srcAmount;
        resolver.lastActivityTime = block.timestamp;
        
        emit OrderCompleted(orderId, secret);
    }
    
    /**
     * @notice Cancel order if conditions are met
     */
    function cancelOrder(bytes32 orderId, string calldata reason) 
        external 
        orderExists(orderId)
        nonReentrant 
    {
        Order storage order = orders[orderId];
        
        // User can cancel if not committed or if resolver timeout
        if (msg.sender == order.user) {
            require(
                order.status == 0 || 
                (order.status == 1 && block.timestamp > order.createdAt + resolverTimeout),
                "Cannot cancel"
            );
        }
        // Resolver can cancel if committed but not deployed
        else if (msg.sender == order.resolver) {
            require(order.status == 1, "Cannot cancel");
        }
        // Owner can cancel any order
        else {
            require(msg.sender == owner, "Not authorized");
        }
        
        order.status = 5;
        
        if (order.resolver != address(0)) {
            resolvers[order.resolver].failedSwaps++;
        }
        
        emit OrderCancelled(orderId, reason);
    }
    
    /**
     * @notice Deactivate resolver and withdraw stake
     */
    function deactivateResolver() external onlyActiveResolver nonReentrant {
        ResolverProfile storage resolver = resolvers[msg.sender];
        require(
            block.timestamp > resolver.lastActivityTime + 1 days,
            "Must wait 1 day after last activity"
        );
        
        uint256 stake = resolver.stakedAmount;
        resolver.isActive = false;
        resolver.stakedAmount = 0;
        
        payable(msg.sender).transfer(stake);
        
        emit ResolverDeactivated(msg.sender);
    }
    
    /**
     * @notice Slash resolver stake for misbehavior
     */
    function slashResolver(address resolver, uint256 amount) external onlyOwner {
        require(resolvers[resolver].stakedAmount >= amount, "Insufficient stake");
        
        resolvers[resolver].stakedAmount -= amount;
        
        // If stake falls below minimum, deactivate resolver
        if (resolvers[resolver].stakedAmount < minResolverStake) {
            resolvers[resolver].isActive = false;
        }
        
        emit ResolverSlashed(resolver, amount);
    }
    
    /**
     * @notice Update configuration
     */
    function updateConfig(
        uint256 _minResolverStake,
        uint256 _orderTimeout,
        uint256 _resolverTimeout
    ) external onlyOwner {
        minResolverStake = _minResolverStake;
        orderTimeout = _orderTimeout;
        resolverTimeout = _resolverTimeout;
    }
    
    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }
    
    /**
     * @notice Get order details
     */
    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }
    
    /**
     * @notice Get resolver profile
     */
    function getResolverProfile(address resolver) external view returns (ResolverProfile memory) {
        return resolvers[resolver];
    }
    
    /**
     * @notice Check if secret hash has been used
     */
    function isSecretHashUsed(bytes32 secretHash) external view returns (bool) {
        return usedSecretHashes[secretHash];
    }
    
    /**
     * @notice Emergency withdraw for owner
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}