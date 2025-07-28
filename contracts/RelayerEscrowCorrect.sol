// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title RelayerEscrow
 * @dev Correct implementation of relayer-orchestrated cross-chain swap
 * Users approve tokens to THIS contract, not to resolvers
 */
contract RelayerEscrow is ReentrancyGuard {
    struct SwapOrder {
        bytes32 orderId;
        address user;
        address srcToken;
        uint256 srcAmount;
        bytes32 secretHash;
        address committedResolver;
        uint256 commitmentTime;
        address srcEscrow;
        address dstEscrow;
        OrderState state;
    }

    enum OrderState {
        None,
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

    event OrderCreated(bytes32 indexed orderId, address indexed user, bytes32 secretHash);
    event OrderCommitted(bytes32 indexed orderId, address indexed resolver);
    event EscrowsDeployed(bytes32 indexed orderId, address srcEscrow, address dstEscrow);
    event FundsLocked(bytes32 indexed orderId, uint256 amount);
    event OrderCompleted(bytes32 indexed orderId, bytes32 secret);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Only relayer");
        _;
    }

    constructor() {
        relayer = msg.sender;
    }

    // Step 2: Create order after user submits to relayer service
    function createOrder(
        bytes32 orderId,
        address user,
        address srcToken,
        uint256 srcAmount,
        bytes32 secretHash
    ) external onlyRelayer {
        require(orders[orderId].state == OrderState.None, "Order exists");
        
        // Verify user has approved tokens to this contract
        require(
            IERC20(srcToken).allowance(user, address(this)) >= srcAmount,
            "Insufficient allowance"
        );

        orders[orderId] = SwapOrder({
            orderId: orderId,
            user: user,
            srcToken: srcToken,
            srcAmount: srcAmount,
            secretHash: secretHash,
            committedResolver: address(0),
            commitmentTime: 0,
            srcEscrow: address(0),
            dstEscrow: address(0),
            state: OrderState.Created
        });

        emit OrderCreated(orderId, user, secretHash);
    }

    // Step 4: Resolver commits to order
    function commitToOrder(bytes32 orderId) external payable {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.Created, "Invalid state");
        require(msg.value >= SAFETY_DEPOSIT, "Insufficient deposit");
        require(authorizedResolvers[msg.sender], "Not authorized");

        order.committedResolver = msg.sender;
        order.commitmentTime = block.timestamp;
        order.state = OrderState.Committed;
        
        resolverDeposits[msg.sender] += msg.value;

        emit OrderCommitted(orderId, msg.sender);
    }

    // Step 6: Resolver notifies escrows deployed
    function notifyEscrowsDeployed(
        bytes32 orderId,
        address srcEscrow,
        address dstEscrow
    ) external {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.Committed, "Invalid state");
        require(msg.sender == order.committedResolver, "Not committed resolver");
        require(
            block.timestamp <= order.commitmentTime + EXECUTION_TIMEOUT,
            "Timeout"
        );

        order.srcEscrow = srcEscrow;
        order.dstEscrow = dstEscrow;
        order.state = OrderState.EscrowsDeployed;

        emit EscrowsDeployed(orderId, srcEscrow, dstEscrow);
    }

    // Step 7: Lock user funds
    function lockUserFunds(bytes32 orderId) external onlyRelayer nonReentrant {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.EscrowsDeployed, "Invalid state");

        // Transfer user's pre-approved funds to source escrow
        IERC20(order.srcToken).transferFrom(
            order.user,
            order.srcEscrow,
            order.srcAmount
        );

        order.state = OrderState.FundsLocked;

        emit FundsLocked(orderId, order.srcAmount);
    }

    // Step 10: Complete order by revealing secret
    function completeOrder(bytes32 orderId, bytes32 secret) external onlyRelayer {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.FundsLocked, "Invalid state");
        require(keccak256(abi.encode(secret)) == order.secretHash, "Invalid secret");

        order.state = OrderState.Completed;

        // Return safety deposit to resolver
        uint256 deposit = resolverDeposits[order.committedResolver];
        if (deposit > 0) {
            resolverDeposits[order.committedResolver] = 0;
            payable(order.committedResolver).transfer(deposit);
        }

        emit OrderCompleted(orderId, secret);
    }

    // Alternative: Rescue timed-out order
    function rescueOrder(bytes32 orderId, bytes32 secret) external nonReentrant {
        SwapOrder storage order = orders[orderId];
        require(order.state == OrderState.FundsLocked, "Invalid state");
        require(
            block.timestamp > order.commitmentTime + EXECUTION_TIMEOUT,
            "Not timed out"
        );
        require(keccak256(abi.encode(secret)) == order.secretHash, "Invalid secret");
        require(authorizedResolvers[msg.sender], "Not authorized");

        // Transfer penalty from original resolver to rescuer
        uint256 penalty = resolverDeposits[order.committedResolver];
        if (penalty > 0) {
            resolverDeposits[order.committedResolver] = 0;
            resolverDeposits[msg.sender] += penalty;
        }

        order.state = OrderState.Rescued;
        emit OrderCompleted(orderId, secret);
    }

    // Admin functions
    function authorizeResolver(address resolver) external onlyRelayer {
        authorizedResolvers[resolver] = true;
    }

    function getOrder(bytes32 orderId) external view returns (SwapOrder memory) {
        return orders[orderId];
    }
}