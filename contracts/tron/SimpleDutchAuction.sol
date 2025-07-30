// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

/**
 * @title Simplified Dutch Auction for UniteDefi (No dependencies)
 * @notice Implements linear price decrease model for cross-chain swaps
 * @dev Standalone contract with no external dependencies for easy deployment
 */
contract SimpleDutchAuction {
    struct Auction {
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 duration;
        address token;
        uint256 amount;
        address seller;
        bool active;
    }

    mapping(bytes32 => Auction) public auctions;
    
    event AuctionCreated(
        bytes32 indexed auctionId,
        address indexed seller,
        address indexed token,
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    );
    
    event AuctionSettled(
        bytes32 indexed auctionId,
        address indexed buyer,
        uint256 price,
        uint256 amount
    );
    
    event AuctionCancelled(bytes32 indexed auctionId);

    error AuctionNotActive();
    error AuctionExpired();
    error InvalidPriceRange();
    error InvalidDuration();
    error UnauthorizedCaller();
    error InsufficientPayment();

    /**
     * @notice Creates a new dutch auction
     */
    function createAuction(
        bytes32 auctionId,
        address token,
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    ) external {
        if (startPrice <= endPrice) revert InvalidPriceRange();
        if (duration == 0) revert InvalidDuration();
        if (auctions[auctionId].active) revert AuctionNotActive();

        auctions[auctionId] = Auction({
            startPrice: startPrice,
            endPrice: endPrice,
            startTime: block.timestamp,
            duration: duration,
            token: token,
            amount: amount,
            seller: msg.sender,
            active: true
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            token,
            amount,
            startPrice,
            endPrice,
            duration
        );
    }

    /**
     * @notice Calculates current auction price
     */
    function getCurrentPrice(bytes32 auctionId) public view returns (uint256) {
        Auction memory auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive();
        
        uint256 elapsed = block.timestamp - auction.startTime;
        if (elapsed >= auction.duration) {
            return auction.endPrice;
        }
        
        uint256 priceDecrease = (auction.startPrice - auction.endPrice) * elapsed / auction.duration;
        return auction.startPrice - priceDecrease;
    }

    /**
     * @notice Settles an auction at current price
     */
    function settleAuction(bytes32 auctionId) external payable {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive();
        
        uint256 currentPrice = getCurrentPrice(auctionId);
        uint256 totalCost = currentPrice * auction.amount / 1e18;
        
        if (msg.value < totalCost) revert InsufficientPayment();
        
        auction.active = false;
        
        emit AuctionSettled(auctionId, msg.sender, currentPrice, auction.amount);
        
        // Return excess payment
        if (msg.value > totalCost) {
            payable(msg.sender).transfer(msg.value - totalCost);
        }
    }

    /**
     * @notice Cancels an active auction
     */
    function cancelAuction(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive();
        if (auction.seller != msg.sender) revert UnauthorizedCaller();
        
        auction.active = false;
        emit AuctionCancelled(auctionId);
    }

    /**
     * @notice Checks if auction is still active
     */
    function isAuctionActive(bytes32 auctionId) external view returns (bool) {
        Auction memory auction = auctions[auctionId];
        return auction.active && (block.timestamp - auction.startTime < auction.duration);
    }
}