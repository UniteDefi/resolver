// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./SimpleDutchAuction.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title UniteResolverV2Simple - Simplified version for testing
 * @notice Implements the new UniteDefi flow without complex EscrowFactory dependencies
 * @dev Simplified version to demonstrate the new architecture
 */
contract UniteResolverV2Simple {
    using SafeERC20 for IERC20;
    
    SimpleDutchAuction public immutable dutchAuction;
    
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
        uint256 safetyDeposit;
    }
    
    // Events
    event AuctionPosted(
        bytes32 indexed auctionId,
        address indexed seller,
        address indexed token,
        uint256 amount,
        uint256 dstChainId
    );
    
    event EscrowCreatedByResolver(
        bytes32 indexed auctionId,
        address indexed resolver,
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

    constructor(address _dutchAuction) {
        dutchAuction = SimpleDutchAuction(_dutchAuction);
    }

    /**
     * @notice STEP 1: Relayer posts auction (no escrow creation)
     * @dev User must have pre-approved tokens to this contract
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
        // Verify user has approved this contract
        uint256 allowance = IERC20(token).allowance(msg.sender, address(this));
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
            safetyDeposit: 0
        });
        
        emit AuctionPosted(auctionId, msg.sender, token, amount, dstChainId);
    }

    /**
     * @notice STEP 2: Resolver creates escrow with safety deposits
     * @dev Resolver must send safety deposit
     */
    function createEscrowWithDeposit(bytes32 auctionId) external payable {
        AuctionData storage auction = auctions[auctionId];
        
        if (!auction.active) revert InvalidAuction();
        if (auction.escrowCreated) revert EscrowAlreadyCreated();
        if (auctionResolver[auctionId] != address(0)) revert AuctionAlreadyHasResolver();
        if (msg.value < SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // Set exclusive resolver lock
        auctionResolver[auctionId] = msg.sender;
        
        auction.escrowCreated = true;
        auction.safetyDeposit = msg.value;
        
        emit EscrowCreatedByResolver(auctionId, msg.sender, msg.value);
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
     * @notice STEP 4: Transfer tokens from seller
     * @dev After resolver commits, transfer seller's tokens
     */
    function transferTokensFromSeller(bytes32 auctionId) external {
        AuctionData storage auction = auctions[auctionId];
        
        require(msg.sender == auction.seller, "Not seller");
        require(!auction.active, "Auction still active");
        require(auction.escrowCreated, "Escrow not created");
        
        // Transfer tokens from seller to this contract (acting as escrow)
        IERC20(auction.token).safeTransferFrom(
            msg.sender,
            address(this),
            auction.amount
        );
    }

    /**
     * @notice Complete the flow - resolver gets tokens + safety deposit back
     * @dev Simplified completion for demo
     */
    function completeSwap(bytes32 auctionId) external {
        AuctionData storage auction = auctions[auctionId];
        
        require(auctionResolver[auctionId] == msg.sender, "Not resolver");
        require(!auction.active, "Auction still active");
        
        // Transfer tokens to resolver
        IERC20(auction.token).safeTransfer(msg.sender, auction.amount);
        
        // Return safety deposit
        payable(msg.sender).transfer(auction.safetyDeposit);
    }

    /**
     * @notice Helper to check if user has approved this contract
     */
    function hasUserApproved(
        address user,
        address token,
        uint256 amount
    ) external view returns (bool) {
        return IERC20(token).allowance(user, address(this)) >= amount;
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

    /**
     * @notice Get current auction price
     */
    function getCurrentPrice(bytes32 auctionId) external view returns (uint256) {
        return dutchAuction.getCurrentPrice(auctionId);
    }

    /**
     * @notice Check if auction is active
     */
    function isAuctionActive(bytes32 auctionId) external view returns (bool) {
        return dutchAuction.isAuctionActive(auctionId);
    }
}