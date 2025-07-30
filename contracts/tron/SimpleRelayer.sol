// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

/**
 * @title SimpleRelayer - Simplified relayer for cross-chain coordination
 */
contract SimpleRelayer {
    struct Order {
        bytes32 id;
        address user;
        address sourceToken;
        uint256 sourceAmount;
        uint256 sourceChain;
        uint256 destChain;
        uint8 status; // 0=Created, 1=Committed, 2=Completed, 3=Failed
        address resolver;
        uint256 expiry;
        bytes32 secret;
    }
    
    mapping(bytes32 => Order) public orders;
    mapping(address => bool) public resolvers;
    mapping(address => uint256) public deposits;
    
    uint256 public constant TIMEOUT = 300; // 5 minutes
    uint256 public constant DEPOSIT = 1000000; // 1 TRX
    
    event OrderCreated(bytes32 indexed id, address user);
    event ResolverCommitted(bytes32 indexed id, address resolver);
    event OrderCompleted(bytes32 indexed id, bytes32 secret);
    
    function registerResolver() external payable {
        require(msg.value >= DEPOSIT, "Insufficient deposit");
        resolvers[msg.sender] = true;
        deposits[msg.sender] = msg.value;
    }
    
    function createOrder(
        bytes32 id,
        address sourceToken,
        uint256 sourceAmount,
        uint256 sourceChain,
        uint256 destChain
    ) external {
        require(orders[id].user == address(0), "Order exists");
        
        orders[id] = Order({
            id: id,
            user: msg.sender,
            sourceToken: sourceToken,
            sourceAmount: sourceAmount,
            sourceChain: sourceChain,
            destChain: destChain,
            status: 0,
            resolver: address(0),
            expiry: 0,
            secret: bytes32(0)
        });
        
        emit OrderCreated(id, msg.sender);
    }
    
    function commitToOrder(bytes32 id) external {
        require(resolvers[msg.sender], "Not a resolver");
        Order storage order = orders[id];
        require(order.status == 0, "Order not available");
        
        order.status = 1;
        order.resolver = msg.sender;
        order.expiry = block.timestamp + TIMEOUT;
        
        emit ResolverCommitted(id, msg.sender);
    }
    
    function completeOrder(bytes32 id, bytes32 secret) external {
        Order storage order = orders[id];
        require(order.status == 1, "Order not committed");
        
        order.status = 2;
        order.secret = secret;
        
        emit OrderCompleted(id, secret);
    }
    
    function getOrder(bytes32 id) external view returns (Order memory) {
        return orders[id];
    }
    
    function canRescue(bytes32 id) external view returns (bool) {
        Order memory order = orders[id];
        return (order.status == 1 && block.timestamp > order.expiry);
    }
}