// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RelayerContract
 * @dev Actual implementation of the relayer contract that handles user's pre-approved funds
 * This is NOT a mock - it implements the actual cross-chain swap relayer functionality
 */
contract RelayerContract is Ownable, ReentrancyGuard {
    // Authorized relayer service addresses
    mapping(address => bool) public authorizedRelayers;
    
    // Track active orders
    mapping(bytes32 => OrderInfo) public orders;
    
    struct OrderInfo {
        address user;
        address srcToken;
        uint256 amount;
        address srcEscrow;
        bool fundsTransferred;
        uint256 timestamp;
    }
    
    event RelayerAuthorized(address indexed relayer);
    event RelayerRevoked(address indexed relayer);
    
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        address srcToken,
        uint256 amount,
        bytes32 secretHash
    );
    
    event UserFundsTransferred(
        bytes32 indexed orderId,
        address indexed user,
        address indexed escrow,
        address token,
        uint256 amount
    );
    
    modifier onlyAuthorizedRelayer() {
        require(
            authorizedRelayers[msg.sender] || msg.sender == owner(),
            "Unauthorized relayer"
        );
        _;
    }
    
    constructor() Ownable(msg.sender) {
        // Owner is automatically an authorized relayer
        authorizedRelayers[msg.sender] = true;
    }
    
    /**
     * @dev Authorize a relayer service address
     * @param relayer Address to authorize
     */
    function authorizeRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Invalid relayer address");
        authorizedRelayers[relayer] = true;
        emit RelayerAuthorized(relayer);
    }
    
    /**
     * @dev Revoke relayer authorization
     * @param relayer Address to revoke
     */
    function revokeRelayer(address relayer) external onlyOwner {
        authorizedRelayers[relayer] = false;
        emit RelayerRevoked(relayer);
    }
    
    /**
     * @dev Register a new swap order
     * @param orderId Unique order identifier
     * @param user User initiating the swap
     * @param srcToken Source token address
     * @param amount Amount to swap
     * @param secretHash HTLC secret hash
     */
    function registerOrder(
        bytes32 orderId,
        address user,
        address srcToken,
        uint256 amount,
        bytes32 secretHash
    ) external onlyAuthorizedRelayer {
        require(orders[orderId].user == address(0), "Order already exists");
        require(user != address(0), "Invalid user");
        require(srcToken != address(0), "Invalid token");
        require(amount > 0, "Invalid amount");
        
        // Verify user has approved this contract
        uint256 allowance = IERC20(srcToken).allowance(user, address(this));
        require(allowance >= amount, "Insufficient allowance");
        
        orders[orderId] = OrderInfo({
            user: user,
            srcToken: srcToken,
            amount: amount,
            srcEscrow: address(0),
            fundsTransferred: false,
            timestamp: block.timestamp
        });
        
        emit OrderCreated(orderId, user, srcToken, amount, secretHash);
    }
    
    /**
     * @dev Transfer user's pre-approved funds to escrow
     * @param orderId Order identifier
     * @param escrowAddress Destination escrow address
     */
    function transferUserFundsToEscrow(
        bytes32 orderId,
        address escrowAddress
    ) external onlyAuthorizedRelayer nonReentrant {
        OrderInfo storage order = orders[orderId];
        require(order.user != address(0), "Order not found");
        require(!order.fundsTransferred, "Funds already transferred");
        require(escrowAddress != address(0), "Invalid escrow address");
        
        // Update order state
        order.srcEscrow = escrowAddress;
        order.fundsTransferred = true;
        
        // Transfer user's pre-approved funds to escrow
        require(
            IERC20(order.srcToken).transferFrom(
                order.user,
                escrowAddress,
                order.amount
            ),
            "Transfer failed"
        );
        
        emit UserFundsTransferred(
            orderId,
            order.user,
            escrowAddress,
            order.srcToken,
            order.amount
        );
    }
    
    /**
     * @dev Check if user has sufficient approved tokens
     * @param user User address
     * @param token Token address
     * @param amount Required amount
     */
    function checkUserApproval(
        address user,
        address token,
        uint256 amount
    ) external view returns (bool) {
        uint256 allowance = IERC20(token).allowance(user, address(this));
        return allowance >= amount;
    }
    
    /**
     * @dev Get order details
     * @param orderId Order identifier
     */
    function getOrder(bytes32 orderId) external view returns (
        address user,
        address srcToken,
        uint256 amount,
        address srcEscrow,
        bool fundsTransferred,
        uint256 timestamp
    ) {
        OrderInfo memory order = orders[orderId];
        return (
            order.user,
            order.srcToken,
            order.amount,
            order.srcEscrow,
            order.fundsTransferred,
            order.timestamp
        );
    }
    
    /**
     * @dev Emergency pause - can be implemented with OpenZeppelin Pausable
     * For now, owner can revoke all relayers in emergency
     */
    function emergencyPause() external onlyOwner {
        // Implementation would pause all transfers
        // For production, use OpenZeppelin's Pausable pattern
    }
}