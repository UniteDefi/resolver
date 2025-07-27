// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockEscrow - Simplified escrow for testing relayer flow
 * @notice Simulates cross-chain escrow functionality for testing
 */
contract MockEscrow {
    using SafeERC20 for IERC20;
    
    address public immutable token;
    uint256 public immutable amount;
    address public immutable beneficiary;
    bytes32 public immutable hashlock;
    uint256 public immutable deadline;
    address public immutable depositor;
    
    bool public withdrawn;
    bool public refunded;
    bytes32 public revealedSecret;
    
    event FundsDeposited(address depositor, uint256 amount);
    event FundsWithdrawn(address beneficiary, bytes32 secret);
    event FundsRefunded(address depositor);
    
    constructor(
        address _token,
        uint256 _amount,
        address _beneficiary,
        bytes32 _hashlock,
        uint256 _deadline,
        address _depositor
    ) {
        token = _token;
        amount = _amount;
        beneficiary = _beneficiary;
        hashlock = _hashlock;
        deadline = _deadline;
        depositor = _depositor;
    }
    
    /**
     * @notice Deposit funds to escrow
     */
    function deposit() external {
        require(msg.sender == depositor, "Only depositor can deposit");
        require(IERC20(token).balanceOf(address(this)) == 0, "Already deposited");
        
        IERC20(token).safeTransferFrom(depositor, address(this), amount);
        emit FundsDeposited(depositor, amount);
    }
    
    /**
     * @notice Withdraw funds with secret
     */
    function withdraw(bytes32 secret) external {
        require(!withdrawn && !refunded, "Already completed");
        require(block.timestamp <= deadline, "Deadline passed");
        require(keccak256(abi.encodePacked(secret)) == hashlock, "Invalid secret");
        require(msg.sender == beneficiary, "Only beneficiary can withdraw");
        
        withdrawn = true;
        revealedSecret = secret;
        
        IERC20(token).safeTransfer(beneficiary, amount);
        emit FundsWithdrawn(beneficiary, secret);
    }
    
    /**
     * @notice Refund funds after deadline
     */
    function refund() external {
        require(!withdrawn && !refunded, "Already completed");
        require(block.timestamp > deadline, "Deadline not passed");
        require(msg.sender == depositor, "Only depositor can refund");
        
        refunded = true;
        
        IERC20(token).safeTransfer(depositor, amount);
        emit FundsRefunded(depositor);
    }
    
    /**
     * @notice Check if escrow has been funded
     */
    function isFunded() external view returns (bool) {
        return IERC20(token).balanceOf(address(this)) >= amount;
    }
}