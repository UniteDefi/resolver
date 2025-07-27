// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./MockEscrowFactory.sol";

/**
 * @title Enhanced Escrow Factory with Rescue Mechanism
 * @notice Extends MockEscrowFactory with rescue capabilities for failed swaps
 */
contract EnhancedEscrowFactory is MockEscrowFactory {
    struct EscrowInfo {
        address srcEscrow;
        address dstEscrow;
        address resolver;
        uint256 creationTime;
        bool isActive;
        bool isRescued;
    }
    
    // Track escrows for rescue mechanism
    mapping(bytes32 => EscrowInfo) public escrowRegistry;
    
    // Track resolver safety deposits for forfeiture
    mapping(address => mapping(bytes32 => uint256)) public resolverDeposits;
    
    event EscrowRegistered(
        bytes32 indexed orderId,
        address indexed resolver,
        address srcEscrow,
        address dstEscrow
    );
    
    event SafetyDepositForfeited(
        bytes32 indexed orderId,
        address indexed resolver,
        uint256 amount
    );
    
    event EscrowRescued(
        bytes32 indexed orderId,
        address indexed rescuer,
        address originalResolver
    );
    
    error EscrowNotFound();
    error NotRescueable();
    error AlreadyRescued();
    
    /**
     * @notice Register escrows created by resolver
     * @dev Called by RelayerService after escrow creation
     */
    function registerEscrows(
        bytes32 orderId,
        address resolver,
        address srcEscrow,
        address dstEscrow
    ) external onlyAuthorizedRelayer {
        escrowRegistry[orderId] = EscrowInfo({
            srcEscrow: srcEscrow,
            dstEscrow: dstEscrow,
            resolver: resolver,
            creationTime: block.timestamp,
            isActive: true,
            isRescued: false
        });
        
        emit EscrowRegistered(orderId, resolver, srcEscrow, dstEscrow);
    }
    
    /**
     * @notice Move user funds to escrow with rescue tracking
     * @dev Overrides parent function to add rescue capabilities
     */
    function moveUserFunds(
        address user,
        address token,
        uint256 amount,
        address escrow
    ) external onlyAuthorizedRelayer {
        if (!userTokenApprovals[user][token]) revert InsufficientAllowance();
        
        IERC20(token).transferFrom(user, escrow, amount);
        emit UserFundsMovedToEscrow(user, token, amount, escrow);
    }
    
    /**
     * @notice Forfeit safety deposit of failed resolver
     * @dev Called when a resolver fails to complete within execution window
     */
    function forfeitSafetyDeposit(
        bytes32 orderId,
        address failedResolver
    ) external onlyAuthorizedRelayer {
        EscrowInfo storage info = escrowRegistry[orderId];
        if (info.resolver != failedResolver) revert EscrowNotFound();
        
        uint256 depositAmount = resolverDeposits[failedResolver][orderId];
        if (depositAmount > 0) {
            resolverDeposits[failedResolver][orderId] = 0;
            emit SafetyDepositForfeited(orderId, failedResolver, depositAmount);
        }
    }
    
    /**
     * @notice Allow rescue resolver to claim forfeited deposits
     * @dev Called after successful rescue completion
     */
    function claimForfeitedDeposit(
        bytes32 orderId,
        address rescueResolver
    ) external onlyAuthorizedRelayer {
        EscrowInfo storage info = escrowRegistry[orderId];
        if (!info.isRescued) revert NotRescueable();
        
        // Transfer forfeited deposits to rescue resolver
        // In production, this would handle actual token/ETH transfers
    }
    
    /**
     * @notice Mark escrow as rescued
     * @dev Called when a rescue resolver successfully completes the swap
     */
    function markEscrowRescued(
        bytes32 orderId,
        address rescueResolver
    ) external onlyAuthorizedRelayer {
        EscrowInfo storage info = escrowRegistry[orderId];
        if (!info.isActive) revert EscrowNotFound();
        if (info.isRescued) revert AlreadyRescued();
        
        info.isRescued = true;
        emit EscrowRescued(orderId, rescueResolver, info.resolver);
    }
    
    /**
     * @notice Check if an escrow can be rescued
     * @param orderId The order ID to check
     * @return canRescue Whether the escrow can be rescued
     * @return originalResolver The original resolver who failed
     */
    function canRescueEscrow(bytes32 orderId) external view returns (
        bool canRescue,
        address originalResolver
    ) {
        EscrowInfo memory info = escrowRegistry[orderId];
        canRescue = info.isActive && !info.isRescued;
        originalResolver = info.resolver;
    }
    
    /**
     * @notice Get full escrow information
     * @param orderId The order ID
     * @return info The escrow information
     */
    function getEscrowInfo(bytes32 orderId) external view returns (EscrowInfo memory info) {
        return escrowRegistry[orderId];
    }
    
    /**
     * @notice Check if relayer is authorized
     * @param relayer The relayer address to check
     * @return bool Whether the relayer is authorized
     */
    function isAuthorizedRelayer(address relayer) external view returns (bool) {
        return authorizedRelayers[relayer];
    }
}