// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Mock interfaces for cross-chain-swap dependencies
interface IBaseEscrow {
    struct Immutables {
        bytes32 orderHash;
        bytes32 hashlock;
        address srcToken;
        address dstToken;
        uint256 srcAmount;
        uint256 dstAmount;
        uint256 srcSafetyDeposit;
        uint256 dstSafetyDeposit;
        address taker;
    }
}

interface IEscrow {
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        bytes calldata data
    ) external payable returns (IEscrow escrow);
}

interface IEscrowFactory {
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        bytes calldata data
    ) external payable returns (IEscrow escrow);
    
    function deployDst(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp,
        bytes calldata data
    ) external payable returns (IEscrow escrow);
}

interface IOrderMixin {
    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        address maker;
        address receiver;
        address allowedSender;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 offsets;
    }
}

/**
 * @title Mock Escrow Factory for Testing
 * @notice Simple mock implementation for testing V2 architecture
 */
contract MockEscrowFactory is Ownable, IEscrowFactory {
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
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Authorize or deauthorize a relayer
     */
    function setRelayerAuthorization(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorized(relayer, authorized);
    }
    
    /**
     * @notice Users call this to pre-approve tokens for gasless operations
     */
    function preApproveToken(address token, uint256 amount) external {
        uint256 currentAllowance = IERC20(token).allowance(msg.sender, address(this));
        if (currentAllowance < amount) revert InsufficientAllowance();
        
        userTokenApprovals[msg.sender][token] = true;
        emit UserPreApproval(msg.sender, token, amount);
    }
    
    /**
     * @notice Check if user has pre-approved a token
     */
    function getUserApproval(address user, address token) external view returns (bool approved, uint256 allowance) {
        approved = userTokenApprovals[user][token];
        allowance = IERC20(token).allowance(user, address(this));
    }
    
    /**
     * @notice Relayer calls this to move pre-approved user funds to escrow
     */
    function moveUserFundsToEscrow(
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
     * @notice Deploy source escrow (mock implementation)
     */
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        bytes calldata data
    ) external payable returns (IEscrow escrow) {
        if (msg.value < RESOLVER_SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // In a real implementation, this would deploy an actual escrow contract
        // For testing, we just return a mock address
        return IEscrow(address(uint160(uint256(immutables.orderHash))));
    }
    
    /**
     * @notice Deploy destination escrow (mock implementation)
     */
    function deployDst(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp,
        bytes calldata data
    ) external payable returns (IEscrow escrow) {
        if (msg.value < RESOLVER_SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // Mock implementation
        return IEscrow(address(uint160(uint256(immutables.orderHash) + 1)));
    }
    
    /**
     * @notice Mock postSrcWithdrawal function
     */
    function postSrcWithdrawal(
        IEscrow escrow,
        bytes32 orderHash,
        address srcToken,
        uint256 amount
    ) external payable {
        if (msg.value < RESOLVER_SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        // Mock implementation - just emit an event
    }
}