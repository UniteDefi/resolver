// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./MockEscrowFactory.sol";

interface IRelayerEscrowFactory is IEscrowFactory {
    function moveUserFunds(address user, address token, uint256 amount, address escrow) external;
    function isAuthorizedRelayer(address relayer) external view returns (bool);
}

interface IResolver {
    function createEscrows(
        bytes32 orderId,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        address user,
        uint256 safetyDeposit
    ) external returns (address srcEscrow, address dstEscrow);
}

interface IRelayerEscrow is IEscrow {
    function unlock(bytes32 secret) external;
    function refund() external;
}

contract RelayerService is Ownable, ReentrancyGuard {
    struct Order {
        bytes32 orderId;
        address user;
        address srcToken;
        address dstToken;
        uint256 srcAmount;
        uint256 dstAmount;
        uint256 srcChainId;
        uint256 dstChainId;
        address committedResolver;
        uint256 commitmentTime;
        address srcEscrow;
        address dstEscrow;
        bool isActive;
        bool isCompleted;
        bool isRescued;
    }

    struct ResolverCommitment {
        bytes32 orderId;
        uint256 commitmentTime;
        bool hasCreatedEscrows;
        address srcEscrow;
        address dstEscrow;
    }

    uint256 public constant EXECUTION_WINDOW = 5 minutes;
    uint256 public constant SAFETY_DEPOSIT_PERCENTAGE = 10; // 10% of order value

    mapping(bytes32 => Order) public orders;
    mapping(address => mapping(bytes32 => ResolverCommitment)) public resolverCommitments;
    mapping(address => bool) public authorizedResolvers;
    
    IRelayerEscrowFactory public escrowFactory;
    
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        address srcToken,
        uint256 srcAmount,
        address dstToken,
        uint256 dstAmount
    );
    
    event ResolverCommitted(
        bytes32 indexed orderId,
        address indexed resolver,
        uint256 commitmentTime
    );
    
    event EscrowsCreated(
        bytes32 indexed orderId,
        address indexed resolver,
        address srcEscrow,
        address dstEscrow
    );
    
    event OrderCompleted(
        bytes32 indexed orderId,
        address indexed resolver,
        bytes32 secret
    );
    
    event OrderRescued(
        bytes32 indexed orderId,
        address indexed originalResolver,
        address indexed rescueResolver
    );
    
    event OrderRefunded(bytes32 indexed orderId, address indexed user);
    
    modifier onlyAuthorizedResolver() {
        require(authorizedResolvers[msg.sender], "Not authorized resolver");
        _;
    }
    
    modifier orderExists(bytes32 orderId) {
        require(orders[orderId].isActive, "Order not active");
        _;
    }
    
    constructor(address _escrowFactory) Ownable(msg.sender) {
        escrowFactory = IRelayerEscrowFactory(_escrowFactory);
    }
    
    function setAuthorizedResolver(address resolver, bool authorized) external onlyOwner {
        authorizedResolvers[resolver] = authorized;
    }
    
    function createOrder(
        address user,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        uint256 srcChainId,
        uint256 dstChainId
    ) external onlyOwner returns (bytes32 orderId) {
        orderId = keccak256(
            abi.encodePacked(
                user,
                srcToken,
                dstToken,
                srcAmount,
                dstAmount,
                srcChainId,
                dstChainId,
                block.timestamp
            )
        );
        
        orders[orderId] = Order({
            orderId: orderId,
            user: user,
            srcToken: srcToken,
            dstToken: dstToken,
            srcAmount: srcAmount,
            dstAmount: dstAmount,
            srcChainId: srcChainId,
            dstChainId: dstChainId,
            committedResolver: address(0),
            commitmentTime: 0,
            srcEscrow: address(0),
            dstEscrow: address(0),
            isActive: true,
            isCompleted: false,
            isRescued: false
        });
        
        emit OrderCreated(orderId, user, srcToken, srcAmount, dstToken, dstAmount);
    }
    
    function commitToOrder(bytes32 orderId) external onlyAuthorizedResolver orderExists(orderId) {
        Order storage order = orders[orderId];
        require(order.committedResolver == address(0), "Order already committed");
        
        order.committedResolver = msg.sender;
        order.commitmentTime = block.timestamp;
        
        resolverCommitments[msg.sender][orderId] = ResolverCommitment({
            orderId: orderId,
            commitmentTime: block.timestamp,
            hasCreatedEscrows: false,
            srcEscrow: address(0),
            dstEscrow: address(0)
        });
        
        emit ResolverCommitted(orderId, msg.sender, block.timestamp);
    }
    
    function notifyEscrowsCreated(
        bytes32 orderId,
        address srcEscrow,
        address dstEscrow
    ) external orderExists(orderId) {
        Order storage order = orders[orderId];
        require(order.committedResolver == msg.sender, "Not committed resolver");
        require(!isExecutionWindowExpired(orderId), "Execution window expired");
        
        ResolverCommitment storage commitment = resolverCommitments[msg.sender][orderId];
        require(!commitment.hasCreatedEscrows, "Escrows already created");
        
        order.srcEscrow = srcEscrow;
        order.dstEscrow = dstEscrow;
        commitment.srcEscrow = srcEscrow;
        commitment.dstEscrow = dstEscrow;
        commitment.hasCreatedEscrows = true;
        
        // Transfer user funds to source escrow
        escrowFactory.moveUserFunds(order.user, order.srcToken, order.srcAmount, srcEscrow);
        
        emit EscrowsCreated(orderId, msg.sender, srcEscrow, dstEscrow);
    }
    
    function completeOrder(bytes32 orderId, bytes32 secret) external onlyOwner orderExists(orderId) {
        Order storage order = orders[orderId];
        require(!order.isCompleted, "Order already completed");
        require(order.srcEscrow != address(0) && order.dstEscrow != address(0), "Escrows not created");
        
        // Unlock destination escrow for user
        IRelayerEscrow(order.dstEscrow).unlock(secret);
        
        order.isCompleted = true;
        order.isActive = false;
        
        emit OrderCompleted(orderId, order.committedResolver, secret);
    }
    
    function rescueOrder(bytes32 orderId) external onlyAuthorizedResolver orderExists(orderId) {
        Order storage order = orders[orderId];
        require(isExecutionWindowExpired(orderId), "Execution window not expired");
        require(!order.isCompleted && !order.isRescued, "Order completed or already rescued");
        require(order.committedResolver != msg.sender, "Cannot rescue own order");
        
        address originalResolver = order.committedResolver;
        
        // Reset order for new resolver
        order.committedResolver = msg.sender;
        order.commitmentTime = block.timestamp;
        order.isRescued = true;
        
        resolverCommitments[msg.sender][orderId] = ResolverCommitment({
            orderId: orderId,
            commitmentTime: block.timestamp,
            hasCreatedEscrows: false,
            srcEscrow: address(0),
            dstEscrow: address(0)
        });
        
        emit OrderRescued(orderId, originalResolver, msg.sender);
    }
    
    function refundOrder(bytes32 orderId) external onlyOwner orderExists(orderId) {
        Order storage order = orders[orderId];
        require(!order.isCompleted, "Order already completed");
        
        // If escrows were created, trigger refunds
        if (order.srcEscrow != address(0)) {
            IRelayerEscrow(order.srcEscrow).refund();
        }
        if (order.dstEscrow != address(0)) {
            IRelayerEscrow(order.dstEscrow).refund();
        }
        
        order.isActive = false;
        
        emit OrderRefunded(orderId, order.user);
    }
    
    function isExecutionWindowExpired(bytes32 orderId) public view returns (bool) {
        Order memory order = orders[orderId];
        if (order.commitmentTime == 0) return false;
        return block.timestamp > order.commitmentTime + EXECUTION_WINDOW;
    }
    
    function calculateSafetyDeposit(uint256 orderValue) public pure returns (uint256) {
        return (orderValue * SAFETY_DEPOSIT_PERCENTAGE) / 100;
    }
}