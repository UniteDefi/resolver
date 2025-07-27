// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title MockRelayer
 * @dev Simple relayer contract for testing cross-chain swaps
 */
contract MockRelayer {
    address public owner;
    mapping(address => bool) public authorizedRelayers;
    
    event UserFundsTransferred(
        address indexed user,
        address indexed token,
        uint256 amount,
        address indexed escrow
    );
    
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        uint256 srcChainId,
        address srcToken,
        uint256 amount
    );
    
    modifier onlyAuthorized() {
        require(authorizedRelayers[msg.sender] || msg.sender == owner, "Unauthorized");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        authorizedRelayers[msg.sender] = true;
    }
    
    function authorizeRelayer(address relayer) external {
        require(msg.sender == owner, "Only owner");
        authorizedRelayers[relayer] = true;
    }
    
    /**
     * @dev Transfer user's pre-approved funds to escrow
     * User must have approved this contract to spend their tokens
     */
    function transferUserFunds(
        address user,
        address token,
        uint256 amount,
        address escrow
    ) external onlyAuthorized returns (bool) {
        // Check allowance
        uint256 allowed = IERC20(token).allowance(user, address(this));
        require(allowed >= amount, "Insufficient allowance");
        
        // Transfer user's funds to escrow
        bool success = IERC20(token).transferFrom(user, escrow, amount);
        require(success, "Transfer failed");
        
        emit UserFundsTransferred(user, token, amount, escrow);
        return true;
    }
    
    /**
     * @dev Check if user has approved sufficient tokens
     */
    function checkUserApproval(
        address user,
        address token,
        uint256 amount
    ) external view returns (bool) {
        uint256 allowed = IERC20(token).allowance(user, address(this));
        return allowed >= amount;
    }
    
    /**
     * @dev Emergency withdraw (only owner)
     */
    function emergencyWithdraw(address token) external {
        require(msg.sender == owner, "Only owner");
        
        if (token == address(0)) {
            // Withdraw ETH
            payable(owner).transfer(address(this).balance);
        } else {
            // Withdraw ERC20
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                IERC20(token).transfer(owner, balance);
            }
        }
    }
    
    // Receive ETH
    receive() external payable {}
}