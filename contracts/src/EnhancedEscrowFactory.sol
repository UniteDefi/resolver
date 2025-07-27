// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "cross-chain-swap/EscrowFactory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Enhanced Escrow Factory for UniteDefi V2
 * @notice Extends EscrowFactory to support user pre-approvals and new flow
 * @dev Key features:
 *      - Users pre-approve tokens to this factory
 *      - Factory can move user funds when authorized by relayer
 *      - Tracks user approvals and balances
 */
contract EnhancedEscrowFactory is EscrowFactory {
    // Track which users have pre-approved for gasless operations
    mapping(address => mapping(address => bool)) public userTokenApprovals;
    
    // Track which relayers are authorized to move user funds
    mapping(address => bool) public authorizedRelayers;
    
    // Safety deposit amount required from resolvers
    uint256 public constant RESOLVER_SAFETY_DEPOSIT = 0.001 ether;
    
    event UserPreApproval(address indexed user, address indexed token, uint256 amount);
    event RelayerAuthorized(address indexed relayer, bool authorized);
    event UserFundsMovedToEscrow(address indexed user, address indexed token, uint256 amount, address escrow);
    
    error UnauthorizedRelayer();
    error InsufficientAllowance();
    error InsufficientSafetyDeposit();
    
    modifier onlyAuthorizedRelayer() {
        if (!authorizedRelayers[msg.sender]) revert UnauthorizedRelayer();
        _;
    }
    
    constructor(
        address limitOrderProtocol,
        IERC20 feeToken,
        IERC20 accessToken,
        address owner,
        uint32 rescueDelaySrc,
        uint32 rescueDelayDst
    ) EscrowFactory(limitOrderProtocol, feeToken, accessToken, owner, rescueDelaySrc, rescueDelayDst) {}
    
    /**
     * @notice Authorize or deauthorize a relayer
     * @param relayer The relayer address
     * @param authorized Whether to authorize or deauthorize
     */
    function setRelayerAuthorization(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorized(relayer, authorized);
    }
    
    /**
     * @notice Users call this to pre-approve tokens for gasless operations
     * @param token The token to approve
     * @param amount The amount to approve
     */
    function preApproveToken(address token, uint256 amount) external {
        // Check current allowance
        uint256 currentAllowance = IERC20(token).allowance(msg.sender, address(this));
        if (currentAllowance < amount) revert InsufficientAllowance();
        
        // Mark user as having pre-approved
        userTokenApprovals[msg.sender][token] = true;
        
        emit UserPreApproval(msg.sender, token, amount);
    }
    
    /**
     * @notice Check if user has pre-approved a token
     * @param user The user address
     * @param token The token address
     * @return approved Whether the user has pre-approved
     * @return allowance Current allowance amount
     */
    function getUserApproval(address user, address token) external view returns (bool approved, uint256 allowance) {
        approved = userTokenApprovals[user][token];
        allowance = IERC20(token).allowance(user, address(this));
    }
    
    /**
     * @notice Override postSrcWithdrawal to ensure safety deposits
     * @dev Verifies resolver included safety deposit when creating escrow
     */
    function postSrcWithdrawal(
        IBaseEscrow escrow,
        bytes32 orderHash,
        address srcToken,
        uint256 amount
    ) external payable override {
        // Verify safety deposit is included
        if (msg.value < RESOLVER_SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // Call parent implementation
        super.postSrcWithdrawal(escrow, orderHash, srcToken, amount);
    }
    
    /**
     * @notice Relayer calls this to move pre-approved user funds to escrow
     * @param user The user whose funds to move
     * @param token The token to transfer
     * @param amount The amount to transfer
     * @param escrow The destination escrow address
     */
    function moveUserFundsToEscrow(
        address user,
        address token,
        uint256 amount,
        address escrow
    ) external onlyAuthorizedRelayer {
        // Verify user has pre-approved
        if (!userTokenApprovals[user][token]) revert InsufficientAllowance();
        
        // Transfer from user to escrow
        IERC20(token).transferFrom(user, escrow, amount);
        
        emit UserFundsMovedToEscrow(user, token, amount, escrow);
    }
    
    /**
     * @notice Deploy source escrow with resolver's safety deposit
     * @dev Overrides parent to ensure safety deposit handling
     */
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        bytes calldata data
    ) external payable returns (IEscrow escrow) {
        // Verify safety deposit
        if (msg.value < RESOLVER_SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // Deploy escrow
        escrow = super.deploySrc(immutables, data);
        
        // Forward safety deposit to escrow
        payable(address(escrow)).transfer(RESOLVER_SAFETY_DEPOSIT);
        
        return escrow;
    }
    
    /**
     * @notice Deploy destination escrow with resolver's safety deposit
     * @dev Overrides parent to ensure safety deposit handling
     */
    function deployDst(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp,
        bytes calldata data
    ) external payable override returns (IEscrow escrow) {
        // Verify safety deposit
        if (msg.value < RESOLVER_SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // Deploy escrow
        escrow = super.deployDst(immutables, srcCancellationTimestamp, data);
        
        // Forward safety deposit to escrow
        payable(address(escrow)).transfer(RESOLVER_SAFETY_DEPOSIT);
        
        return escrow;
    }
}