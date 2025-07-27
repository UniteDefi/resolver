// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./SimpleDutchAuction.sol";
import "./Resolver.sol";
import "cross-chain-swap/interfaces/IEscrowFactory.sol";
import "cross-chain-swap/libraries/SafeTransferLib.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title UniteResolverV2 - New Architecture with EscrowFactory Integration
 * @notice Implements the new UniteDefi flow with EscrowFactory for cross-chain swaps
 * @dev Users pre-approve tokens to EscrowFactory, resolvers create escrows with deposits
 */
contract UniteResolverV2 is Resolver {
    using SafeTransferLib for IERC20;
    
    SimpleDutchAuction public immutable dutchAuction;
    IEscrowFactory public immutable escrowFactory;
    
    // Safety deposit amount (0.001 ETH)
    uint256 public constant SAFETY_DEPOSIT = 0.001 ether;
    
    // Auction tracking
    mapping(bytes32 => AuctionData) public auctions;
    mapping(bytes32 => address) public auctionResolver; // Exclusive resolver lock
    
    struct AuctionData {
        address seller;
        address token;
        uint256 amount;
        uint256 dstChainId;
        bytes32 hashlock;
        bool active;
        bool escrowCreated;
        address srcEscrow;
        address dstEscrow;
    }
    
    // Events
    event AuctionPosted(
        bytes32 indexed auctionId,
        address indexed seller,
        address indexed token,
        uint256 amount,
        uint256 dstChainId
    );
    
    event EscrowsCreatedByResolver(
        bytes32 indexed auctionId,
        address indexed resolver,
        address srcEscrow,
        address dstEscrow,
        uint256 safetyDeposit
    );
    
    event AuctionSettledByResolver(
        bytes32 indexed auctionId,
        address indexed resolver,
        uint256 price
    );

    // Errors
    error AuctionAlreadyHasResolver();
    error NotAuctionResolver();
    error InsufficientSafetyDeposit();
    error EscrowAlreadyCreated();
    error InvalidAuction();
    error UserHasNotApprovedFactory();

    constructor(
        address _dutchAuction,
        address _escrowFactory,
        address limitOrderProtocol,
        IERC20 feeToken
    ) Resolver(limitOrderProtocol, address(_escrowFactory), feeToken) {
        dutchAuction = SimpleDutchAuction(_dutchAuction);
        escrowFactory = IEscrowFactory(_escrowFactory);
    }

    /**
     * @notice STEP 1: Relayer posts auction (no escrow creation)
     * @dev User must have pre-approved tokens to EscrowFactory
     */
    function postCrossChainAuction(
        bytes32 auctionId,
        address token,
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration,
        uint256 dstChainId,
        bytes32 hashlock
    ) external {
        // Verify user has approved EscrowFactory
        uint256 allowance = IERC20(token).allowance(msg.sender, address(escrowFactory));
        if (allowance < amount) revert UserHasNotApprovedFactory();
        
        // Create auction through SimpleDutchAuction
        dutchAuction.createAuction(
            auctionId,
            token,
            amount,
            startPrice,
            endPrice,
            duration
        );
        
        // Store auction data
        auctions[auctionId] = AuctionData({
            seller: msg.sender,
            token: token,
            amount: amount,
            dstChainId: dstChainId,
            hashlock: hashlock,
            active: true,
            escrowCreated: false,
            srcEscrow: address(0),
            dstEscrow: address(0)
        });
        
        emit AuctionPosted(auctionId, msg.sender, token, amount, dstChainId);
    }

    /**
     * @notice STEP 2: Resolver creates escrows with safety deposits
     * @dev Resolver must send safety deposit and deploy escrows on both chains
     */
    function createEscrowsWithDeposit(
        bytes32 auctionId,
        uint32 srcSafetyDeposit,
        uint32 dstSafetyDeposit,
        Immutables memory srcImmutables,
        Immutables memory dstImmutables
    ) external payable {
        AuctionData storage auction = auctions[auctionId];
        
        if (!auction.active) revert InvalidAuction();
        if (auction.escrowCreated) revert EscrowAlreadyCreated();
        if (auctionResolver[auctionId] != address(0)) revert AuctionAlreadyHasResolver();
        if (msg.value < SAFETY_DEPOSIT * 2) revert InsufficientSafetyDeposit(); // Safety deposit for both chains
        
        // Set exclusive resolver lock
        auctionResolver[auctionId] = msg.sender;
        
        // Deploy source escrow (where seller's tokens are)
        // The resolver pays the safety deposit
        address srcEscrow = escrowFactory.createEscrow{value: SAFETY_DEPOSIT}(
            IEscrowFactory.Params({
                immutables: srcImmutables,
                receiver: msg.sender, // Resolver will receive on source chain
                srcToken: auction.token,
                srcAmount: auction.amount,
                safetyDeposit: srcSafetyDeposit
            })
        );
        
        // Note: Destination escrow would be deployed on destination chain
        // For this example, we're storing the computed address
        address dstEscrow = escrowFactory.computeEscrowAddress(
            msg.sender, // Seller will receive on destination chain
            dstImmutables
        );
        
        auction.escrowCreated = true;
        auction.srcEscrow = srcEscrow;
        auction.dstEscrow = dstEscrow;
        
        emit EscrowsCreatedByResolver(
            auctionId,
            msg.sender,
            srcEscrow,
            dstEscrow,
            msg.value
        );
    }

    /**
     * @notice STEP 3: Resolver settles auction (exclusive right)
     * @dev Only the resolver who created escrows can settle
     */
    function settleAuctionAsResolver(bytes32 auctionId) external payable {
        if (auctionResolver[auctionId] != msg.sender) revert NotAuctionResolver();
        
        AuctionData storage auction = auctions[auctionId];
        require(auction.active, "Auction not active");
        require(auction.escrowCreated, "Escrows not created");
        
        // Get current price and settle
        uint256 currentPrice = dutchAuction.getCurrentPrice(auctionId);
        uint256 totalCost = currentPrice * auction.amount / 1e18;
        
        // Settle auction
        dutchAuction.settleAuction{value: msg.value}(auctionId);
        
        auction.active = false;
        
        emit AuctionSettledByResolver(auctionId, msg.sender, currentPrice);
    }

    /**
     * @notice STEP 4: Seller transfers tokens to escrow
     * @dev After resolver commits, seller moves tokens to source escrow
     */
    function transferTokensToEscrow(bytes32 auctionId) external {
        AuctionData storage auction = auctions[auctionId];
        
        require(msg.sender == auction.seller, "Not seller");
        require(!auction.active, "Auction still active");
        require(auction.srcEscrow != address(0), "Escrow not created");
        
        // Transfer tokens from seller to source escrow
        // Note: Seller should have approved EscrowFactory
        IERC20(auction.token).safeTransferFrom(
            msg.sender,
            auction.srcEscrow,
            auction.amount
        );
    }

    /**
     * @notice Helper to check if user has approved factory
     */
    function hasUserApprovedFactory(
        address user,
        address token,
        uint256 amount
    ) external view returns (bool) {
        return IERC20(token).allowance(user, address(escrowFactory)) >= amount;
    }

    /**
     * @notice Get auction details
     */
    function getAuction(bytes32 auctionId) external view returns (
        address seller,
        address token,
        uint256 amount,
        uint256 dstChainId,
        bool active,
        address resolver
    ) {
        AuctionData memory auction = auctions[auctionId];
        return (
            auction.seller,
            auction.token,
            auction.amount,
            auction.dstChainId,
            auction.active,
            auctionResolver[auctionId]
        );
    }
}