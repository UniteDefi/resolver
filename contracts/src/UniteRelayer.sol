// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title UniteRelayer - Centralized Cross-Chain Swap Orchestrator
 * @notice Manages the entire swap process between users and resolvers
 * @dev Orchestrates order submission, resolver commitment, escrow deployment, and fund transfers
 */
contract UniteRelayer is ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant EXECUTION_TIMEOUT = 5 minutes;
    uint256 public constant SAFETY_DEPOSIT = 0.001 ether;
    
    // Owner
    address public owner;
    
    // Order management
    uint256 public nextOrderId;
    mapping(uint256 => Order) public orders;
    mapping(uint256 => Commitment) public commitments;
    mapping(address => bool) public registeredResolvers;
    
    struct Order {
        uint256 id;
        address user;
        address srcToken;
        uint256 srcAmount;
        address dstToken;
        uint256 minDstAmount;
        uint256 srcChainId;
        uint256 dstChainId;
        bytes32 hashlock;
        uint256 deadline;
        OrderStatus status;
        uint256 timestamp;
    }
    
    struct Commitment {
        address resolver;
        uint256 commitTime;
        uint256 executionDeadline;
        address srcEscrow;
        address dstEscrow;
        bool fundsTransferred;
        bool srcEscrowDeployed;
        bool dstEscrowDeployed;
        bool completed;
        bool rescued;
    }
    
    enum OrderStatus {
        Pending,      // Order submitted, waiting for resolver
        Committed,    // Resolver committed, execution timer started
        Executing,    // Escrows deployed, funds being transferred
        Completed,    // Swap completed successfully
        Rescued,      // Failed commitment rescued by another resolver
        Cancelled     // Order cancelled
    }
    
    // Events
    event OrderSubmitted(
        uint256 indexed orderId,
        address indexed user,
        address srcToken,
        uint256 srcAmount,
        address dstToken,
        uint256 minDstAmount
    );
    
    event ResolverCommitted(
        uint256 indexed orderId,
        address indexed resolver,
        uint256 executionDeadline
    );
    
    event EscrowsDeployed(
        uint256 indexed orderId,
        address srcEscrow,
        address dstEscrow
    );
    
    event FundsTransferred(
        uint256 indexed orderId,
        address user,
        address srcEscrow,
        uint256 amount
    );
    
    event SecretRevealed(
        uint256 indexed orderId,
        bytes32 secret
    );
    
    event OrderCompleted(
        uint256 indexed orderId,
        address resolver
    );
    
    event OrderRescued(
        uint256 indexed orderId,
        address rescuer,
        address originalResolver
    );
    
    // Errors
    error OnlyOwner();
    error OnlyRegisteredResolver();
    error InvalidOrder();
    error OrderAlreadyCommitted();
    error NotCommittedResolver();
    error ExecutionTimeExpired();
    error EscrowsNotDeployed();
    error FundsAlreadyTransferred();
    error OrderNotExecuting();
    error CannotRescueYet();
    error InsufficientSafetyDeposit();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }
    
    modifier onlyRegisteredResolver() {
        if (!registeredResolvers[msg.sender]) revert OnlyRegisteredResolver();
        _;
    }

    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @notice Register a resolver to participate in order fulfillment
     */
    function registerResolver(address resolver) external onlyOwner {
        registeredResolvers[resolver] = true;
    }
    
    /**
     * @notice Unregister a resolver
     */
    function unregisterResolver(address resolver) external onlyOwner {
        registeredResolvers[resolver] = false;
    }
    
    /**
     * @notice STEP 1: User submits order to relayer service
     * @dev User must have pre-approved tokens to this contract
     */
    function submitOrder(
        address srcToken,
        uint256 srcAmount,
        address dstToken,
        uint256 minDstAmount,
        uint256 srcChainId,
        uint256 dstChainId,
        bytes32 hashlock,
        uint256 deadline
    ) external returns (uint256 orderId) {
        // Verify user has approved tokens
        require(
            IERC20(srcToken).allowance(msg.sender, address(this)) >= srcAmount,
            "Insufficient token approval"
        );
        
        orderId = nextOrderId++;
        
        orders[orderId] = Order({
            id: orderId,
            user: msg.sender,
            srcToken: srcToken,
            srcAmount: srcAmount,
            dstToken: dstToken,
            minDstAmount: minDstAmount,
            srcChainId: srcChainId,
            dstChainId: dstChainId,
            hashlock: hashlock,
            deadline: deadline,
            status: OrderStatus.Pending,
            timestamp: block.timestamp
        });
        
        emit OrderSubmitted(
            orderId,
            msg.sender,
            srcToken,
            srcAmount,
            dstToken,
            minDstAmount
        );
    }
    
    /**
     * @notice STEP 2: Resolver commits to fulfilling an order
     * @dev This simulates the resolver API interaction - starts 5-minute timer
     */
    function commitToOrder(uint256 orderId) 
        external 
        payable 
        onlyRegisteredResolver 
        nonReentrant 
    {
        Order storage order = orders[orderId];
        
        if (order.status != OrderStatus.Pending) revert OrderAlreadyCommitted();
        if (msg.value < SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        uint256 executionDeadline = block.timestamp + EXECUTION_TIMEOUT;
        
        commitments[orderId] = Commitment({
            resolver: msg.sender,
            commitTime: block.timestamp,
            executionDeadline: executionDeadline,
            srcEscrow: address(0),
            dstEscrow: address(0),
            fundsTransferred: false,
            srcEscrowDeployed: false,
            dstEscrowDeployed: false,
            completed: false,
            rescued: false
        });
        
        order.status = OrderStatus.Committed;
        
        emit ResolverCommitted(orderId, msg.sender, executionDeadline);
    }
    
    /**
     * @notice STEP 3: Resolver deploys escrows on both chains
     * @dev In practice, this would be called after actual escrow deployment
     */
    function notifyEscrowsDeployed(
        uint256 orderId,
        address srcEscrow,
        address dstEscrow
    ) external onlyRegisteredResolver {
        Commitment storage commitment = commitments[orderId];
        Order storage order = orders[orderId];
        
        if (commitment.resolver != msg.sender) revert NotCommittedResolver();
        if (block.timestamp > commitment.executionDeadline) revert ExecutionTimeExpired();
        if (order.status != OrderStatus.Committed) revert InvalidOrder();
        
        commitment.srcEscrow = srcEscrow;
        commitment.dstEscrow = dstEscrow;
        commitment.srcEscrowDeployed = true;
        commitment.dstEscrowDeployed = true;
        
        order.status = OrderStatus.Executing;
        
        emit EscrowsDeployed(orderId, srcEscrow, dstEscrow);
    }
    
    /**
     * @notice STEP 4: Relayer transfers user's pre-approved funds to source escrow
     * @dev Called automatically after escrows are deployed
     */
    function transferUserFunds(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        Commitment storage commitment = commitments[orderId];
        
        if (order.status != OrderStatus.Executing) revert OrderNotExecuting();
        if (!commitment.srcEscrowDeployed) revert EscrowsNotDeployed();
        if (commitment.fundsTransferred) revert FundsAlreadyTransferred();
        
        // Transfer user's pre-approved tokens to source escrow
        IERC20(order.srcToken).safeTransferFrom(
            order.user,
            commitment.srcEscrow,
            order.srcAmount
        );
        
        commitment.fundsTransferred = true;
        
        emit FundsTransferred(
            orderId,
            order.user,
            commitment.srcEscrow,
            order.srcAmount
        );
    }
    
    /**
     * @notice STEP 5: Relayer reveals secret on destination chain
     * @dev This unlocks funds for user and returns safety deposit to resolver
     */
    function revealSecret(uint256 orderId, bytes32 secret) external {
        Order storage order = orders[orderId];
        Commitment storage commitment = commitments[orderId];
        
        // Verify secret matches hashlock
        require(keccak256(abi.encodePacked(secret)) == order.hashlock, "Invalid secret");
        
        if (order.status != OrderStatus.Executing) revert OrderNotExecuting();
        if (!commitment.fundsTransferred) revert FundsAlreadyTransferred();
        
        // Mark as completed
        commitment.completed = true;
        order.status = OrderStatus.Completed;
        
        // Return safety deposit to resolver
        payable(commitment.resolver).transfer(SAFETY_DEPOSIT);
        
        emit SecretRevealed(orderId, secret);
        emit OrderCompleted(orderId, commitment.resolver);
    }
    
    /**
     * @notice STEP 6: Rescue mechanism - other resolvers can complete failed orders
     * @dev Available after 5-minute timeout, rescuer gets original resolver's safety deposit
     */
    function rescueOrder(uint256 orderId, address srcEscrow, address dstEscrow) 
        external 
        payable 
        onlyRegisteredResolver 
        nonReentrant 
    {
        Order storage order = orders[orderId];
        Commitment storage commitment = commitments[orderId];
        
        if (order.status != OrderStatus.Committed && order.status != OrderStatus.Executing) {
            revert InvalidOrder();
        }
        if (block.timestamp <= commitment.executionDeadline) revert CannotRescueYet();
        if (msg.value < SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        address originalResolver = commitment.resolver;
        
        // Update commitment to rescuer
        commitment.resolver = msg.sender;
        commitment.commitTime = block.timestamp;
        commitment.executionDeadline = block.timestamp + EXECUTION_TIMEOUT;
        commitment.srcEscrow = srcEscrow;
        commitment.dstEscrow = dstEscrow;
        commitment.rescued = true;
        
        order.status = OrderStatus.Rescued;
        
        // Rescuer gets original resolver's safety deposit as penalty reward
        // (Original resolver's deposit was already held)
        
        emit OrderRescued(orderId, msg.sender, originalResolver);
        emit EscrowsDeployed(orderId, srcEscrow, dstEscrow);
    }
    
    /**
     * @notice Cancel an order (only by user if no commitment exists)
     */
    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        
        require(msg.sender == order.user, "Only order user can cancel");
        require(order.status == OrderStatus.Pending, "Cannot cancel committed order");
        
        order.status = OrderStatus.Cancelled;
    }
    
    /**
     * @notice Get order details
     */
    function getOrder(uint256 orderId) external view returns (
        Order memory order,
        Commitment memory commitment
    ) {
        return (orders[orderId], commitments[orderId]);
    }
    
    /**
     * @notice Check if resolver can rescue an order
     */
    function canRescue(uint256 orderId) external view returns (bool) {
        Order memory order = orders[orderId];
        Commitment memory commitment = commitments[orderId];
        
        return (order.status == OrderStatus.Committed || order.status == OrderStatus.Executing) &&
               block.timestamp > commitment.executionDeadline &&
               !commitment.completed;
    }
    
    /**
     * @notice Emergency owner functions
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
    
    receive() external payable {}
}