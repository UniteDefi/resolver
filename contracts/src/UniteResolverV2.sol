// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./Resolver.sol";
import "./SimpleDutchAuction.sol";
import {IBaseEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IBaseEscrow.sol";
import {IEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IEscrow.sol";
import {IEscrowFactory} from "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {IOrderMixin} from "limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title UniteDefi Resolver V2 - New Architecture
 * @notice Implements the new flow where resolvers create escrows after winning auctions
 * @dev Key changes:
 *      - Auctions are posted without creating escrows
 *      - Resolvers create escrows with safety deposits on both chains
 *      - Exclusive resolver lock after escrow creation
 *      - Relayer moves funds only after resolver commits
 */
contract UniteResolverV2 is Resolver {
    SimpleDutchAuction public immutable dutchAuction;
    
    // Auction to winning resolver mapping
    mapping(bytes32 => address) public auctionWinner;
    
    // Escrow to auction mapping for tracking
    mapping(bytes32 => bytes32) public escrowToAuction;
    
    // Auction to escrow mapping
    mapping(bytes32 => bytes32) public auctionToEscrow;
    
    // Track if user funds have been moved by relayer
    mapping(bytes32 => bool) public userFundsMoved;
    
    // Safety deposit amount (0.001 ETH)
    uint256 public constant SAFETY_DEPOSIT = 0.001 ether;
    
    event AuctionWon(bytes32 indexed auctionId, address indexed resolver, uint256 price);
    event EscrowCreatedByResolver(bytes32 indexed auctionId, bytes32 indexed escrowId, address indexed resolver);
    event UserFundsMovedByRelayer(bytes32 indexed auctionId, address indexed relayer);
    
    error NotAuctionWinner();
    error EscrowAlreadyCreated();
    error InsufficientSafetyDeposit();
    error UserFundsNotMoved();
    error UnauthorizedRelayer();
    
    constructor(
        IEscrowFactory factory,
        IOrderMixin lop,
        address initialOwner,
        address _dutchAuction
    ) Resolver(factory, lop, initialOwner) {
        dutchAuction = SimpleDutchAuction(_dutchAuction);
    }
    
    /**
     * @notice Resolver wins auction by settling it
     * @dev This doesn't create escrow yet, just records the winner
     * @param auctionId The auction to settle
     */
    function winAuction(bytes32 auctionId) external payable {
        uint256 currentPrice = dutchAuction.getCurrentPrice(auctionId);
        
        // Settle the auction (this will revert if already settled)
        dutchAuction.settleAuction{value: msg.value}(auctionId);
        
        // Record the winner
        auctionWinner[auctionId] = msg.sender;
        
        emit AuctionWon(auctionId, msg.sender, currentPrice);
    }
    
    /**
     * @notice Winning resolver creates escrows on both chains
     * @dev Only the auction winner can create escrows
     * @param auctionId The auction ID
     * @param srcImmutables Source chain escrow parameters
     * @param dstImmutables Destination chain escrow parameters
     * @param order The limit order
     */
    function createEscrowsAsResolver(
        bytes32 auctionId,
        IBaseEscrow.Immutables calldata srcImmutables,
        IBaseEscrow.Immutables calldata dstImmutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args,
        uint256 srcCancellationTimestamp
    ) external payable {
        // Verify caller is the auction winner
        if (auctionWinner[auctionId] != msg.sender) revert NotAuctionWinner();
        
        // Verify escrow not already created
        if (auctionToEscrow[auctionId] != bytes32(0)) revert EscrowAlreadyCreated();
        
        // Verify safety deposit is included
        if (msg.value < SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // Create escrow ID
        bytes32 escrowId = keccak256(abi.encodePacked(srcImmutables.orderHash, srcImmutables.hashlock));
        
        // Link auction and escrow
        auctionToEscrow[auctionId] = escrowId;
        escrowToAuction[escrowId] = auctionId;
        
        // Deploy source chain escrow (resolver deposits their tokens)
        deploySrc(srcImmutables, order, r, vs, amount, takerTraits, args);
        
        // Deploy destination chain escrow (resolver deposits safety deposit)
        deployDst(dstImmutables, srcCancellationTimestamp);
        
        emit EscrowCreatedByResolver(auctionId, escrowId, msg.sender);
    }
    
    /**
     * @notice Relayer moves user funds after resolver has created escrows
     * @dev This is called by the relayer service after verifying resolver commitment
     * @param auctionId The auction ID
     * @param userToken The token to transfer from user
     * @param amount The amount to transfer
     * @param user The user address
     */
    function moveUserFunds(
        bytes32 auctionId,
        address userToken,
        uint256 amount,
        address user
    ) external onlyOwner {
        // Verify escrows have been created by resolver
        bytes32 escrowId = auctionToEscrow[auctionId];
        if (escrowId == bytes32(0)) revert EscrowAlreadyCreated();
        
        // Verify funds haven't been moved already
        if (userFundsMoved[auctionId]) revert UnauthorizedRelayer();
        
        // Mark funds as moved
        userFundsMoved[auctionId] = true;
        
        // Transfer user's tokens to escrow
        // Note: User must have pre-approved the EscrowFactory
        IERC20(userToken).transferFrom(user, address(this), amount);
        
        emit UserFundsMovedByRelayer(auctionId, msg.sender);
    }
    
    /**
     * @notice Check if resolver has exclusive rights to an auction
     * @param auctionId The auction ID
     * @param resolver The resolver address
     * @return bool True if resolver has exclusive rights
     */
    function hasExclusiveRights(bytes32 auctionId, address resolver) external view returns (bool) {
        return auctionWinner[auctionId] == resolver && auctionToEscrow[auctionId] != bytes32(0);
    }
    
    /**
     * @notice Get auction details including winner and escrow status
     * @param auctionId The auction ID
     * @return winner The winning resolver address
     * @return escrowCreated Whether escrow has been created
     * @return fundsMoved Whether user funds have been moved
     */
    function getAuctionStatus(bytes32 auctionId) external view returns (
        address winner,
        bool escrowCreated,
        bool fundsMoved
    ) {
        winner = auctionWinner[auctionId];
        escrowCreated = auctionToEscrow[auctionId] != bytes32(0);
        fundsMoved = userFundsMoved[auctionId];
    }
}