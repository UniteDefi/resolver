// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./MockResolver.sol";
import "./RelayerService.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title UniteDefi Resolver V2 - Relayer Service Architecture
 * @notice Implements the new flow where relayer orchestrates swaps
 * @dev Key changes:
 *      - No auction mechanism, relayer assigns resolvers
 *      - Resolvers commit through relayer API
 *      - Resolvers create escrows with safety deposits
 *      - 5-minute execution window with rescue mechanism
 */
contract UniteResolverV2 is MockResolver {
    RelayerService public immutable relayerService;
    
    // Order to escrow mapping
    mapping(bytes32 => bytes32) public orderToEscrow;
    
    // Escrow to order mapping for tracking
    mapping(bytes32 => bytes32) public escrowToOrder;
    
    // Track resolver escrows for recovery
    mapping(address => mapping(bytes32 => bool)) public resolverEscrows;
    
    // Safety deposit amount (0.001 ETH)
    uint256 public constant SAFETY_DEPOSIT = 0.001 ether;
    
    event EscrowsCreated(
        bytes32 indexed orderId,
        bytes32 indexed escrowId,
        address indexed resolver,
        address srcEscrow,
        address dstEscrow
    );
    
    event ResolverWithdrawal(
        bytes32 indexed orderId,
        address indexed resolver,
        uint256 amount
    );
    
    error UnauthorizedResolver();
    error EscrowAlreadyCreated();
    error InsufficientSafetyDeposit();
    error NotCommittedResolver();
    error OrderNotActive();
    
    constructor(
        IEscrowFactory factory,
        address lop,
        address initialOwner,
        address _relayerService
    ) MockResolver(factory, lop, initialOwner) {
        relayerService = RelayerService(_relayerService);
    }
    
    /**
     * @notice Resolver creates escrows after being assigned by relayer
     * @dev Only resolvers that committed through API can create escrows
     * @param orderId The order ID from relayer service
     * @param srcImmutables Source chain escrow parameters
     * @param dstImmutables Destination chain escrow parameters
     * @param order The limit order
     */
    function createEscrowsForOrder(
        bytes32 orderId,
        IBaseEscrow.Immutables calldata srcImmutables,
        IBaseEscrow.Immutables calldata dstImmutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits memory takerTraits,
        bytes calldata args,
        uint256 srcCancellationTimestamp
    ) external payable returns (address srcEscrow, address dstEscrow) {
        // Get order details from relayer service
        (
            ,
            address user,
            address srcToken,
            ,
            uint256 srcAmount,
            ,
            ,
            ,
            address committedResolver,
            ,
            ,
            ,
            bool isActive,
            ,
        ) = relayerService.orders(orderId);
        
        // Verify order is active
        if (!isActive) revert OrderNotActive();
        
        // Verify caller is the committed resolver
        if (committedResolver != msg.sender) revert NotCommittedResolver();
        
        // Verify escrow not already created
        if (orderToEscrow[orderId] != bytes32(0)) revert EscrowAlreadyCreated();
        
        // Verify safety deposit is included
        if (msg.value < SAFETY_DEPOSIT * 2) revert InsufficientSafetyDeposit();
        
        // Create escrow ID
        bytes32 escrowId = keccak256(abi.encodePacked(srcImmutables.orderHash, srcImmutables.hashlock));
        
        // Link order and escrow
        orderToEscrow[orderId] = escrowId;
        escrowToOrder[escrowId] = orderId;
        
        // Deploy source chain escrow (resolver deposits their tokens + safety deposit)
        srcEscrow = deploySrc(srcImmutables, order, r, vs, amount, takerTraits, args);
        
        // Send safety deposit to source escrow
        (bool sent, ) = srcEscrow.call{value: SAFETY_DEPOSIT}("");
        require(sent, "Failed to send safety deposit to src escrow");
        
        // Deploy destination chain escrow (resolver deposits dstAmount + safety deposit)
        dstEscrow = deployDst(dstImmutables, srcCancellationTimestamp);
        
        // Send safety deposit to destination escrow
        (bool sent2, ) = dstEscrow.call{value: SAFETY_DEPOSIT}("");
        require(sent2, "Failed to send safety deposit to dst escrow");
        
        // Track resolver's escrows
        resolverEscrows[msg.sender][orderId] = true;
        
        // Notify relayer service about escrow creation
        relayerService.notifyEscrowsCreated(orderId, srcEscrow, dstEscrow);
        
        emit EscrowsCreated(orderId, escrowId, msg.sender, srcEscrow, dstEscrow);
        
        return (srcEscrow, dstEscrow);
    }
    
    /**
     * @notice Resolver withdraws from source escrow using secret
     * @param orderId The order ID
     * @param secret The secret revealed by relayer
     */
    function withdrawFromSourceEscrow(
        bytes32 orderId,
        bytes32 secret
    ) external {
        // Verify resolver created this escrow
        require(resolverEscrows[msg.sender][orderId], "Not your escrow");
        
        // Get escrow address from relayer service
        (,,,,,,,,,, address srcEscrow,,,,) = relayerService.orders(orderId);
        require(srcEscrow != address(0), "Escrow not found");
        
        // Unlock the escrow with secret
        IRelayerEscrow(srcEscrow).unlock(secret);
        
        emit ResolverWithdrawal(orderId, msg.sender, 0);
    }
    
    /**
     * @notice Check if a resolver can rescue an order
     * @param orderId The order ID
     * @param resolver The resolver address
     * @return canRescue Whether the resolver can rescue the order
     */
    function canRescueOrder(bytes32 orderId, address resolver) external view returns (bool canRescue) {
        if (!relayerService.authorizedResolvers(resolver)) return false;
        if (!relayerService.isExecutionWindowExpired(orderId)) return false;
        
        (,,,,,,,, address committedResolver,,,, bool isActive, bool isCompleted, bool isRescued) = relayerService.orders(orderId);
        
        return isActive && !isCompleted && !isRescued && committedResolver != resolver;
    }
    
    /**
     * @notice Get order escrow details
     * @param orderId The order ID
     * @return escrowId The escrow ID
     * @return srcEscrow Source escrow address
     * @return dstEscrow Destination escrow address
     */
    function getOrderEscrows(bytes32 orderId) external view returns (
        bytes32 escrowId,
        address srcEscrow,
        address dstEscrow
    ) {
        escrowId = orderToEscrow[orderId];
        (,,,,,,,,,, srcEscrow, dstEscrow,,,) = relayerService.orders(orderId);
    }
}