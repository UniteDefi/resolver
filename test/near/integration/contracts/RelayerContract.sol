// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract RelayerContract {
    struct SwapOrder {
        address user;
        address sourceToken;
        address destToken;
        uint256 sourceAmount;
        uint256 destAmount;
        bytes32 secretHash;
        uint256 deadline;
        string destChain;
        string destRecipient;
        bool isCompleted;
        bool isCancelled;
    }
    
    struct ResolverCommitment {
        address resolver;
        address sourceEscrow;
        address destEscrow;
        uint256 commitTime;
        bool isActive;
        bool isCompleted;
    }
    
    mapping(bytes32 => SwapOrder) public orders;
    mapping(bytes32 => ResolverCommitment) public commitments;
    mapping(address => bool) public authorizedResolvers;
    
    address public relayerOperator;
    uint256 public constant EXECUTION_TIMEOUT = 300; // 5 minutes
    
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        address sourceToken,
        uint256 sourceAmount,
        uint256 destAmount,
        string destChain,
        bytes32 secretHash
    );
    
    event ResolverCommitted(
        bytes32 indexed orderId,
        address indexed resolver,
        address sourceEscrow,
        address destEscrow,
        uint256 commitTime
    );
    
    event OrderCompleted(
        bytes32 indexed orderId,
        address indexed resolver,
        bytes32 secret
    );
    
    event OrderRescued(
        bytes32 indexed orderId,
        address indexed rescuer,
        address indexed originalResolver
    );
    
    modifier onlyRelayer() {
        require(msg.sender == relayerOperator, "Only relayer can call");
        _;
    }
    
    modifier onlyAuthorizedResolver() {
        require(authorizedResolvers[msg.sender], "Not authorized resolver");
        _;
    }
    
    constructor() {
        relayerOperator = msg.sender;
    }
    
    function authorizeResolver(address resolver) external onlyRelayer {
        authorizedResolvers[resolver] = true;
    }
    
    function createOrder(
        address sourceToken,
        address destToken,
        uint256 sourceAmount,
        uint256 destAmount,
        bytes32 secretHash,
        uint256 deadline,
        string memory destChain,
        string memory destRecipient
    ) external returns (bytes32 orderId) {
        orderId = keccak256(abi.encodePacked(
            msg.sender,
            sourceToken,
            destToken,
            sourceAmount,
            secretHash,
            block.timestamp
        ));
        
        orders[orderId] = SwapOrder({
            user: msg.sender,
            sourceToken: sourceToken,
            destToken: destToken,
            sourceAmount: sourceAmount,
            destAmount: destAmount,
            secretHash: secretHash,
            deadline: deadline,
            destChain: destChain,
            destRecipient: destRecipient,
            isCompleted: false,
            isCancelled: false
        });
        
        emit OrderCreated(
            orderId,
            msg.sender,
            sourceToken,
            sourceAmount,
            destAmount,
            destChain,
            secretHash
        );
    }
    
    function commitToOrder(
        bytes32 orderId,
        address sourceEscrow,
        address destEscrow
    ) external onlyAuthorizedResolver {
        SwapOrder storage order = orders[orderId];
        require(order.user != address(0), "Order does not exist");
        require(!order.isCompleted, "Order already completed");
        require(block.timestamp <= order.deadline, "Order expired");
        require(!commitments[orderId].isActive, "Order already committed");
        
        commitments[orderId] = ResolverCommitment({
            resolver: msg.sender,
            sourceEscrow: sourceEscrow,
            destEscrow: destEscrow,
            commitTime: block.timestamp,
            isActive: true,
            isCompleted: false
        });
        
        emit ResolverCommitted(orderId, msg.sender, sourceEscrow, destEscrow, block.timestamp);
    }
    
    function transferUserFunds(bytes32 orderId) external onlyRelayer {
        SwapOrder storage order = orders[orderId];
        ResolverCommitment storage commitment = commitments[orderId];
        
        require(order.user != address(0), "Order does not exist");
        require(commitment.isActive, "No active commitment");
        require(!order.isCompleted, "Order already completed");
        
        // Transfer user's pre-approved tokens to source escrow
        require(
            IERC20(order.sourceToken).transferFrom(
                order.user,
                commitment.sourceEscrow,
                order.sourceAmount
            ),
            "Transfer failed"
        );
    }
    
    function completeOrder(bytes32 orderId, bytes32 secret) external onlyRelayer {
        SwapOrder storage order = orders[orderId];
        ResolverCommitment storage commitment = commitments[orderId];
        
        require(order.user != address(0), "Order does not exist");
        require(commitment.isActive, "No active commitment");
        require(!order.isCompleted, "Order already completed");
        require(sha256(abi.encodePacked(secret)) == order.secretHash, "Invalid secret");
        
        order.isCompleted = true;
        commitment.isCompleted = true;
        
        emit OrderCompleted(orderId, commitment.resolver, secret);
    }
    
    function rescueOrder(
        bytes32 orderId,
        address newSourceEscrow,
        address newDestEscrow
    ) external onlyAuthorizedResolver {
        SwapOrder storage order = orders[orderId];
        ResolverCommitment storage commitment = commitments[orderId];
        
        require(order.user != address(0), "Order does not exist");
        require(commitment.isActive, "No active commitment");
        require(!order.isCompleted, "Order already completed");
        require(
            block.timestamp > commitment.commitTime + EXECUTION_TIMEOUT,
            "Execution timeout not reached"
        );
        require(msg.sender != commitment.resolver, "Cannot rescue own order");
        
        address originalResolver = commitment.resolver;
        
        // Update commitment to new resolver
        commitment.resolver = msg.sender;
        commitment.sourceEscrow = newSourceEscrow;
        commitment.destEscrow = newDestEscrow;
        commitment.commitTime = block.timestamp;
        
        emit OrderRescued(orderId, msg.sender, originalResolver);
    }
    
    function getOrder(bytes32 orderId) external view returns (SwapOrder memory) {
        return orders[orderId];
    }
    
    function getCommitment(bytes32 orderId) external view returns (ResolverCommitment memory) {
        return commitments[orderId];
    }
    
    function isOrderExecutable(bytes32 orderId) external view returns (bool) {
        SwapOrder storage order = orders[orderId];
        ResolverCommitment storage commitment = commitments[orderId];
        
        return order.user != address(0) &&
               !order.isCompleted &&
               commitment.isActive &&
               block.timestamp <= order.deadline;
    }
    
    function isOrderRescuable(bytes32 orderId) external view returns (bool) {
        SwapOrder storage order = orders[orderId];
        ResolverCommitment storage commitment = commitments[orderId];
        
        return order.user != address(0) &&
               !order.isCompleted &&
               commitment.isActive &&
               block.timestamp > commitment.commitTime + EXECUTION_TIMEOUT;
    }
}