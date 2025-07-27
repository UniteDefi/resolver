// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RelayerEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant SAFETY_DEPOSIT_AMOUNT = 0.01 ether;
    uint256 public constant EXECUTION_TIMEOUT = 300; // 5 minutes

    // Order states
    enum OrderState {
        Pending,
        Committed,
        EscrowsDeployed,
        FundsLocked,
        Completed,
        Rescued,
        Cancelled
    }

    // Structures
    struct SwapOrder {
        bytes32 orderId;
        address user;
        address srcToken;
        address dstToken;
        uint256 srcAmount;
        uint256 dstAmount;
        uint256 srcChainId;
        uint256 dstChainId;
        OrderState state;
        address committedResolver;
        uint256 commitmentTime;
        bytes32 secretHash;
        address srcEscrow;
        address dstEscrow;
        uint256 createdAt;
    }

    struct ResolverDeposit {
        address resolver;
        uint256 amount;
        bytes32 lockedForOrder; // bytes32(0) if not locked
        uint256 depositTime;
    }

    // State variables
    address public relayer;
    mapping(bytes32 => SwapOrder) public orders;
    mapping(address => ResolverDeposit) public resolverDeposits;
    mapping(address => mapping(address => uint256)) public tokenAllowances; // user => token => amount
    uint256 public orderCounter;

    // Events
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        uint256 srcAmount,
        uint256 dstAmount,
        uint256 srcChainId,
        uint256 dstChainId
    );

    event OrderCommitted(
        bytes32 indexed orderId,
        address indexed resolver,
        uint256 commitmentTime
    );

    event EscrowsDeployed(
        bytes32 indexed orderId,
        address indexed resolver,
        address srcEscrow,
        address dstEscrow
    );

    event FundsLocked(
        bytes32 indexed orderId,
        bool userFundsLocked,
        bool resolverFundsLocked
    );

    event OrderCompleted(
        bytes32 indexed orderId,
        address indexed user,
        address indexed resolver,
        bytes32 secret
    );

    event OrderRescued(
        bytes32 indexed orderId,
        address indexed originalResolver,
        address indexed rescueResolver,
        uint256 penaltyClaimed
    );

    event SafetyDepositAdded(
        address indexed resolver,
        uint256 amount
    );

    event SafetyDepositWithdrawn(
        address indexed resolver,
        uint256 amount
    );

    // Modifiers
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not authorized relayer");
        _;
    }

    modifier validOrder(bytes32 orderId) {
        require(orders[orderId].user != address(0), "Order not found");
        _;
    }

    constructor(address _relayer) {
        relayer = _relayer;
    }

    // User approves tokens to relayer
    function approveTokens(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenAllowances[msg.sender][token] += amount;
    }

    // Resolver deposits safety funds
    function depositSafetyFunds() external payable {
        require(msg.value >= SAFETY_DEPOSIT_AMOUNT, "Insufficient safety deposit");
        
        resolverDeposits[msg.sender].resolver = msg.sender;
        resolverDeposits[msg.sender].amount += msg.value;
        resolverDeposits[msg.sender].depositTime = block.timestamp;

        emit SafetyDepositAdded(msg.sender, msg.value);
    }

    // Resolver withdraws unused safety funds
    function withdrawSafetyFunds(uint256 amount) external nonReentrant {
        ResolverDeposit storage deposit = resolverDeposits[msg.sender];
        require(deposit.amount >= amount, "Insufficient balance");
        require(deposit.lockedForOrder == bytes32(0), "Funds locked for order");
        
        deposit.amount -= amount;
        payable(msg.sender).transfer(amount);

        emit SafetyDepositWithdrawn(msg.sender, amount);
    }

    // Relayer creates order for user
    function createOrder(
        address user,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        uint256 srcChainId,
        uint256 dstChainId
    ) external onlyRelayer returns (bytes32) {
        bytes32 orderId = keccak256(abi.encodePacked(
            user,
            srcAmount,
            dstAmount,
            block.timestamp,
            orderCounter++
        ));

        orders[orderId] = SwapOrder({
            orderId: orderId,
            user: user,
            srcToken: srcToken,
            dstToken: dstToken,
            srcAmount: srcAmount,
            dstAmount: dstAmount,
            srcChainId: srcChainId,
            dstChainId: dstChainId,
            state: OrderState.Pending,
            committedResolver: address(0),
            commitmentTime: 0,
            secretHash: bytes32(0),
            srcEscrow: address(0),
            dstEscrow: address(0),
            createdAt: block.timestamp
        });

        emit OrderCreated(orderId, user, srcAmount, dstAmount, srcChainId, dstChainId);
        return orderId;
    }

    // Resolver commits to fulfill order
    function commitToOrder(bytes32 orderId) external validOrder(orderId) {
        SwapOrder storage order = orders[orderId];
        ResolverDeposit storage deposit = resolverDeposits[msg.sender];
        
        require(order.state == OrderState.Pending, "Invalid order state");
        require(deposit.amount >= SAFETY_DEPOSIT_AMOUNT, "Insufficient safety deposit");
        require(deposit.lockedForOrder == bytes32(0), "Already committed to another order");

        // Lock resolver deposit for this order
        deposit.lockedForOrder = orderId;

        // Update order
        order.state = OrderState.Committed;
        order.committedResolver = msg.sender;
        order.commitmentTime = block.timestamp;

        emit OrderCommitted(orderId, msg.sender, block.timestamp);
    }

    // Resolver notifies escrows are deployed
    function notifyEscrowsDeployed(
        bytes32 orderId,
        bytes32 secretHash,
        address srcEscrow,
        address dstEscrow
    ) external validOrder(orderId) {
        SwapOrder storage order = orders[orderId];
        
        require(order.state == OrderState.Committed, "Invalid order state");
        require(order.committedResolver == msg.sender, "Not committed resolver");

        // Update order
        order.state = OrderState.EscrowsDeployed;
        order.secretHash = secretHash;
        order.srcEscrow = srcEscrow;
        order.dstEscrow = dstEscrow;

        emit EscrowsDeployed(orderId, msg.sender, srcEscrow, dstEscrow);
    }

    // Relayer locks user funds in source escrow
    function lockUserFunds(bytes32 orderId, address token) external onlyRelayer validOrder(orderId) {
        SwapOrder storage order = orders[orderId];
        
        require(order.state == OrderState.EscrowsDeployed, "Invalid order state");
        require(tokenAllowances[order.user][token] >= order.srcAmount, "Insufficient allowance");

        // Transfer from user allowance to escrow (simplified - in real implementation would be cross-chain)
        tokenAllowances[order.user][token] -= order.srcAmount;
        
        order.state = OrderState.FundsLocked;

        emit FundsLocked(orderId, true, true);
    }

    // Relayer completes order by revealing secret
    function completeOrder(bytes32 orderId, bytes32 secret) external onlyRelayer validOrder(orderId) {
        SwapOrder storage order = orders[orderId];
        
        require(order.state == OrderState.FundsLocked, "Invalid order state");
        require(keccak256(abi.encodePacked(secret)) == order.secretHash, "Invalid secret");

        // Release resolver's safety deposit
        ResolverDeposit storage deposit = resolverDeposits[order.committedResolver];
        deposit.lockedForOrder = bytes32(0);

        order.state = OrderState.Completed;

        emit OrderCompleted(orderId, order.user, order.committedResolver, secret);
    }

    // Any resolver can rescue timed-out order
    function rescueOrder(bytes32 orderId, bytes32 secret) external validOrder(orderId) {
        SwapOrder storage order = orders[orderId];
        ResolverDeposit storage rescueDeposit = resolverDeposits[msg.sender];
        
        require(order.state == OrderState.FundsLocked, "Invalid order state");
        require(block.timestamp >= order.commitmentTime + EXECUTION_TIMEOUT, "Timeout not reached");
        require(rescueDeposit.amount >= SAFETY_DEPOSIT_AMOUNT, "Insufficient safety deposit");
        require(keccak256(abi.encodePacked(secret)) == order.secretHash, "Invalid secret");

        address originalResolver = order.committedResolver;
        ResolverDeposit storage originalDeposit = resolverDeposits[originalResolver];

        // Transfer penalty from original resolver to rescue resolver
        uint256 penalty = SAFETY_DEPOSIT_AMOUNT;
        originalDeposit.amount -= penalty;
        originalDeposit.lockedForOrder = bytes32(0);
        rescueDeposit.amount += penalty;

        order.state = OrderState.Rescued;
        order.committedResolver = msg.sender;

        emit OrderRescued(orderId, originalResolver, msg.sender, penalty);
    }

    // View functions
    function getOrder(bytes32 orderId) external view returns (
        OrderState state,
        address user,
        address committedResolver,
        uint256 srcAmount,
        uint256 dstAmount,
        uint256 commitmentTime
    ) {
        SwapOrder storage order = orders[orderId];
        return (
            order.state,
            order.user,
            order.committedResolver,
            order.srcAmount,
            order.dstAmount,
            order.commitmentTime
        );
    }

    function getResolverDeposit(address resolver) external view returns (
        uint256 amount,
        bool isLocked,
        uint256 depositTime
    ) {
        ResolverDeposit storage deposit = resolverDeposits[resolver];
        return (
            deposit.amount,
            deposit.lockedForOrder != bytes32(0),
            deposit.depositTime
        );
    }

    function isOrderExpired(bytes32 orderId) external view returns (bool) {
        SwapOrder storage order = orders[orderId];
        return order.state == OrderState.FundsLocked && 
               block.timestamp >= order.commitmentTime + EXECUTION_TIMEOUT;
    }

    function getUserTokenAllowance(address user, address token) external view returns (uint256) {
        return tokenAllowances[user][token];
    }

    // Emergency functions
    function updateRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }
}