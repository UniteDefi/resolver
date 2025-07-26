// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Token Dutch Auction for UniteDefi
 * @notice Implements dutch auction for ERC20 token swaps
 * @dev Sellers offer tokens, buyers pay in ETH
 */
contract TokenDutchAuction {
    using SafeERC20 for IERC20;

    struct Auction {
        uint256 startPrice;    // Price per token in wei
        uint256 endPrice;      // Price per token in wei
        uint256 startTime;
        uint256 duration;
        address token;         // Token being sold
        uint256 amount;        // Amount of tokens
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
        uint256 amount,
        uint256 totalCost
    );
    
    event AuctionCancelled(bytes32 indexed auctionId);

    error AuctionNotActive();
    error AuctionExpired();
    error InvalidPriceRange();
    error InvalidDuration();
    error UnauthorizedCaller();
    error InsufficientPayment();
    error TransferFailed();

    /**
     * @notice Creates a new dutch auction for selling tokens
     * @param auctionId Unique auction identifier
     * @param token Token to sell
     * @param amount Amount of tokens to sell
     * @param startPrice Starting price per token in wei
     * @param endPrice Ending price per token in wei
     * @param duration Auction duration in seconds
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

        // Transfer tokens from seller to contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

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
     * @notice Calculates current auction price per token
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
     * @notice Get auction details
     */
    function getAuction(bytes32 auctionId) external view returns (
        address seller,
        address token,
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 startTime,
        uint256 duration,
        bool isActive
    ) {
        Auction memory auction = auctions[auctionId];
        return (
            auction.seller,
            auction.token,
            auction.amount,
            auction.startPrice,
            auction.endPrice,
            auction.startTime,
            auction.duration,
            auction.active
        );
    }

    /**
     * @notice Settles an auction - buyer pays ETH, receives tokens
     */
    function settleAuction(bytes32 auctionId) external payable {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive();
        
        uint256 currentPrice = getCurrentPrice(auctionId);
        uint256 totalCost = currentPrice * auction.amount / 1e18;
        
        if (msg.value < totalCost) revert InsufficientPayment();
        
        auction.active = false;
        
        // Transfer tokens to buyer
        IERC20(auction.token).safeTransfer(msg.sender, auction.amount);
        
        // Transfer ETH to seller
        (bool success, ) = auction.seller.call{value: totalCost}("");
        if (!success) revert TransferFailed();
        
        emit AuctionSettled(auctionId, msg.sender, currentPrice, auction.amount, totalCost);
        
        // Return excess payment
        if (msg.value > totalCost) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - totalCost}("");
            if (!refundSuccess) revert TransferFailed();
        }
    }

    /**
     * @notice Cancels an active auction and returns tokens to seller
     */
    function cancelAuction(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive();
        if (auction.seller != msg.sender) revert UnauthorizedCaller();
        
        auction.active = false;
        
        // Return tokens to seller
        IERC20(auction.token).safeTransfer(auction.seller, auction.amount);
        
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