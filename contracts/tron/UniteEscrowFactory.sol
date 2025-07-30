// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../../../contracts/lib/cross-chain-swap/contracts/EscrowFactory.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "solidity-utils/contracts/libraries/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Unite Escrow Factory for Tron
 * @notice Extends 1inch EscrowFactory to allow users to approve funds to this contract
 * @dev Only authorized relayers can transfer user funds to escrows
 * Compatible with Tron's TVM requirements
 */
contract UniteEscrowFactory is EscrowFactory, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Owner storage (since EscrowFactory doesn't expose owner modifier)
    address private _owner;
    
    // Mapping of authorized relayer addresses
    mapping(address => bool) public authorizedRelayers;
    
    // Events
    event RelayerAuthorized(address indexed relayer);
    event RelayerRevoked(address indexed relayer);
    event UserFundsTransferredToEscrow(
        address indexed user,
        address indexed escrow,
        address indexed token,
        uint256 amount
    );
    
    modifier onlyOwner() {
        require(msg.sender == _owner, "Not owner");
        _;
    }
    
    modifier onlyAuthorizedRelayer() {
        require(authorizedRelayers[msg.sender], "Unauthorized relayer");
        _;
    }
    
    constructor(
        address limitOrderProtocol,
        IERC20 feeToken,
        IERC20 accessToken,
        address initialOwner,
        uint32 rescueDelaySrc,
        uint32 rescueDelayDst
    ) EscrowFactory(
        limitOrderProtocol,
        feeToken,
        accessToken,
        initialOwner,
        rescueDelaySrc,
        rescueDelayDst
    ) {
        _owner = initialOwner;
        // Authorize the owner as initial relayer
        authorizedRelayers[initialOwner] = true;
    }
    
    /**
     * @notice Authorize a relayer to transfer user funds
     * @param relayer Address to authorize
     */
    function authorizeRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Invalid relayer address");
        authorizedRelayers[relayer] = true;
        emit RelayerAuthorized(relayer);
    }
    
    /**
     * @notice Revoke relayer authorization
     * @param relayer Address to revoke
     */
    function revokeRelayer(address relayer) external onlyOwner {
        authorizedRelayers[relayer] = false;
        emit RelayerRevoked(relayer);
    }
    
    /**
     * @notice Transfer user's pre-approved funds to escrow
     * @dev Only authorized relayers can call this function
     * @param user User whose funds to transfer
     * @param token Token to transfer
     * @param amount Amount to transfer
     * @param escrow Destination escrow address
     */
    function transferUserFundsToEscrow(
        address user,
        address token,
        uint256 amount,
        address escrow
    ) external onlyAuthorizedRelayer nonReentrant {
        require(user != address(0), "Invalid user");
        require(escrow != address(0), "Invalid escrow");
        require(amount > 0, "Invalid amount");
        
        // Transfer user's pre-approved funds to escrow
        IERC20(token).safeTransferFrom(user, escrow, amount);
        
        emit UserFundsTransferredToEscrow(user, escrow, token, amount);
    }
    
    /**
     * @notice Get the owner address
     */
    function owner() external view returns (address) {
        return _owner;
    }
    
    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        _owner = newOwner;
    }
}