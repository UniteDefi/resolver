// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title RelayerEscrow
 * @dev Implements the relayer-orchestrated cross-chain swap architecture
 */
contract RelayerEscrow is ReentrancyGuard {
    struct SwapOrder {
        bytes32 orderId;
        address user;
        address srcToken;
        address dstToken;
        uint256 srcAmount;
        uint256 dstAmount;
        uint256 srcChainId;
        uint256 dstChainId;
        bytes32 secretHash;
        address committedResolver;
        uint256 commitmentTime;
        uint256 deadline;
        OrderState state;
    }

    enum OrderState {
        Created,
        Committed,
        EscrowsDeployed,
        FundsLocked,
        Completed,
        Rescued,
        Cancelled
    }

    address public relayer;
    uint256 public constant EXECUTION_TIMEOUT = 5 minutes;
    uint256 public constant SAFETY_DEPOSIT = 0.01 ether;

    mapping(bytes32 => SwapOrder) public orders;
    mapping(address => uint256) public resolverDeposits;
    mapping(address => bool) public authorizedResolvers;

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount
    );
    
    event OrderCommitted(
        bytes32 indexed orderId,
        address indexed resolver,
        uint256 deadline
    );
    
    event EscrowsDeployed(
        bytes32 indexed orderId,
        address srcEscrow,
        address dstEscrow
    );
    
    event FundsLocked(
        bytes32 indexed orderId,
        uint256 amount
    );
    
    event OrderCompleted(
        bytes32 indexed orderId,
        bytes32 secret
    );
    
    event OrderRescued(
        bytes32 indexed orderId,
        address originalResolver,
        address rescueResolver
    );

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Only relayer can call this");
        _;
    }

    modifier validOrder(bytes32 orderId) {
        require(orders[orderId].orderId != bytes32(0), "Order does not exist");
        _;
    }

    constructor() {
        relayer = msg.sender;
    }

    // Step 2: Relayer creates order after receiving user submission
    function createOrder(
        bytes32 orderId,
        address user,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        uint256 srcChainId,
        uint256 dstChainId,
        bytes32 secretHash
    ) external onlyRelayer {
        require(orders[orderId].orderId == bytes32(0), "Order already exists");

        orders[orderId] = SwapOrder({
            orderId: orderId,
            user: user,
            srcToken: srcToken,
            dstToken: dstToken,
            srcAmount: srcAmount,
            dstAmount: dstAmount,
            srcChainId: srcChainId,
            dstChainId: dstChainId,
            secretHash: secretHash,
            committedResolver: address(0),
            commitmentTime: 0,
            deadline: 0,
            state: OrderState.Created
        });

        emit OrderCreated(orderId, user, srcToken, dstToken, srcAmount, dstAmount);
    }

    // Step 4: Resolver commits to fulfill order
    function commitToOrder(bytes32 orderId) 
        external 
        payable 
        validOrder(orderId) 
        nonReentrant 
    {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.Created, "Order not in Created state");
        require(msg.value >= SAFETY_DEPOSIT, "Insufficient safety deposit");
        require(authorizedResolvers[msg.sender], "Resolver not authorized");

        order.committedResolver = msg.sender;
        order.commitmentTime = block.timestamp;
        order.deadline = block.timestamp + EXECUTION_TIMEOUT;
        order.state = OrderState.Committed;

        resolverDeposits[msg.sender] += msg.value;

        emit OrderCommitted(orderId, msg.sender, order.deadline);
    }

    // Step 6: Resolver notifies escrows are deployed
    function notifyEscrowsDeployed(
        bytes32 orderId,
        address srcEscrow,
        address dstEscrow
    ) external validOrder(orderId) {
        SwapOrder storage order = orders[orderId];
        require(msg.sender == order.committedResolver, "Only committed resolver");
        require(order.state == OrderState.Committed, "Order not in Committed state");

        order.state = OrderState.EscrowsDeployed;

        emit EscrowsDeployed(orderId, srcEscrow, dstEscrow);
    }

    // Step 7: Relayer locks user funds after escrows are ready
    function lockUserFunds(bytes32 orderId) 
        external 
        onlyRelayer 
        validOrder(orderId) 
        nonReentrant 
    {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.EscrowsDeployed, "Escrows not deployed");

        // Transfer user's pre-approved tokens to this contract
        IERC20(order.srcToken).transferFrom(
            order.user,
            address(this),
            order.srcAmount
        );

        order.state = OrderState.FundsLocked;

        emit FundsLocked(orderId, order.srcAmount);
    }

    // Step 10: Relayer completes order by revealing secret
    function completeOrder(bytes32 orderId, bytes32 secret) 
        external 
        onlyRelayer 
        validOrder(orderId) 
        nonReentrant 
    {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.FundsLocked, "Funds not locked");
        require(keccak256(abi.encode(secret)) == order.secretHash, "Invalid secret");

        // Return safety deposit to resolver
        uint256 deposit = resolverDeposits[order.committedResolver];
        resolverDeposits[order.committedResolver] = 0;
        
        // Transfer source tokens to committed resolver
        IERC20(order.srcToken).transfer(order.committedResolver, order.srcAmount);
        
        // Return safety deposit
        payable(order.committedResolver).transfer(deposit);

        order.state = OrderState.Completed;

        emit OrderCompleted(orderId, secret);
    }

    // Alternative: Rescue timed-out order
    function rescueOrder(bytes32 orderId, bytes32 secret) 
        external 
        validOrder(orderId) 
        nonReentrant 
    {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.FundsLocked, "Funds not locked");
        require(block.timestamp > order.deadline, "Order not timed out");
        require(keccak256(abi.encode(secret)) == order.secretHash, "Invalid secret");
        require(authorizedResolvers[msg.sender], "Resolver not authorized");

        address originalResolver = order.committedResolver;
        
        // Transfer original resolver's deposit to rescuer as penalty
        uint256 penalty = resolverDeposits[originalResolver];
        resolverDeposits[originalResolver] = 0;
        
        // Transfer source tokens to rescuer
        IERC20(order.srcToken).transfer(msg.sender, order.srcAmount);
        
        // Give penalty to rescuer
        payable(msg.sender).transfer(penalty);

        order.state = OrderState.Rescued;

        emit OrderRescued(orderId, originalResolver, msg.sender);
    }

    // Relayer management functions
    function authorizeResolver(address resolver) external onlyRelayer {
        authorizedResolvers[resolver] = true;
    }

    function revokeResolver(address resolver) external onlyRelayer {
        authorizedResolvers[resolver] = false;
    }

    function getOrder(bytes32 orderId) external view returns (SwapOrder memory) {
        return orders[orderId];
    }
}