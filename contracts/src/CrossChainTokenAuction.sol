// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Cross-Chain Token Dutch Auction
 * @notice Token-to-token swaps with cross-chain support
 * @dev Supports dutch auction for token pairs across chains
 */
contract CrossChainTokenAuction {
    using SafeERC20 for IERC20;

    struct Auction {
        // Source chain info
        address srcToken;
        uint256 srcAmount;
        uint256 srcChainId;
        
        // Destination chain info
        address destToken;
        uint256 destChainId;
        
        // Auction parameters (in dest token units)
        uint256 startPrice;    // Starting amount of dest tokens
        uint256 endPrice;      // Ending amount of dest tokens
        uint256 startTime;
        uint256 duration;
        
        // Participants
        address seller;
        bool active;
        
        // HTLC parameters
        bytes32 hashlock;
        uint256 timelock;
    }

    mapping(bytes32 => Auction) public auctions;
    mapping(bytes32 => address) public resolvers; // auctionId => resolver who filled
    mapping(bytes32 => bytes32) public secrets;   // auctionId => secret
    
    event CrossChainAuctionCreated(
        bytes32 indexed auctionId,
        address indexed seller,
        uint256 srcChainId,
        address srcToken,
        uint256 srcAmount,
        uint256 destChainId,
        address destToken,
        uint256 startPrice,
        uint256 endPrice,
        bytes32 hashlock
    );
    
    event AuctionFilled(
        bytes32 indexed auctionId,
        address indexed resolver,
        uint256 destAmount,
        uint256 timestamp
    );
    
    event AuctionRevealed(
        bytes32 indexed auctionId,
        bytes32 secret
    );
    
    event AuctionClaimed(
        bytes32 indexed auctionId,
        address indexed claimer
    );

    error AuctionNotActive();
    error InvalidPriceRange();
    error InvalidDuration();
    error UnauthorizedCaller();
    error InvalidSecret();
    error TimelockNotExpired();
    error AlreadyFilled();

    /**
     * @notice Creates cross-chain token auction
     * @param auctionId Unique auction identifier
     * @param srcToken Source token address
     * @param srcAmount Amount of source tokens to sell
     * @param destChainId Destination chain ID
     * @param destToken Destination token address
     * @param startPrice Starting dest token amount (decreases over time)
     * @param endPrice Ending dest token amount
     * @param duration Auction duration in seconds
     * @param hashlock HTLC hashlock for atomic swap
     */
    function createCrossChainAuction(
        bytes32 auctionId,
        address srcToken,
        uint256 srcAmount,
        uint256 destChainId,
        address destToken,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration,
        bytes32 hashlock
    ) external {
        if (startPrice <= endPrice) revert InvalidPriceRange();
        if (duration == 0) revert InvalidDuration();
        if (auctions[auctionId].active) revert AuctionNotActive();

        // Transfer tokens from seller to contract
        IERC20(srcToken).safeTransferFrom(msg.sender, address(this), srcAmount);

        auctions[auctionId] = Auction({
            srcToken: srcToken,
            srcAmount: srcAmount,
            srcChainId: block.chainid,
            destToken: destToken,
            destChainId: destChainId,
            startPrice: startPrice,
            endPrice: endPrice,
            startTime: block.timestamp,
            duration: duration,
            seller: msg.sender,
            active: true,
            hashlock: hashlock,
            timelock: block.timestamp + duration + 3600 // 1 hour after auction ends
        });

        emit CrossChainAuctionCreated(
            auctionId,
            msg.sender,
            block.chainid,
            srcToken,
            srcAmount,
            destChainId,
            destToken,
            startPrice,
            endPrice,
            hashlock
        );
    }

    /**
     * @notice Get current price in destination tokens
     */
    function getCurrentPrice(bytes32 auctionId) public view returns (uint256) {
        Auction memory auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive();
        
        uint256 elapsed = block.timestamp - auction.startTime;
        if (elapsed >= auction.duration) {
            return auction.endPrice;
        }
        
        // Linear decrease from startPrice to endPrice
        uint256 priceDecrease = (auction.startPrice - auction.endPrice) * elapsed / auction.duration;
        return auction.startPrice - priceDecrease;
    }

    /**
     * @notice Resolver fills the auction on destination chain
     * @dev Resolver locks dest tokens, gets src tokens after revealing secret
     */
    function fillAuction(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (!auction.active) revert AuctionNotActive();
        if (resolvers[auctionId] != address(0)) revert AlreadyFilled();
        
        uint256 currentPrice = getCurrentPrice(auctionId);
        
        // This should be called on destination chain
        // Resolver locks destination tokens
        IERC20(auction.destToken).safeTransferFrom(msg.sender, address(this), currentPrice);
        
        resolvers[auctionId] = msg.sender;
        auction.active = false;
        
        emit AuctionFilled(auctionId, msg.sender, currentPrice, block.timestamp);
    }

    /**
     * @notice Reveal secret to claim tokens (called by seller on dest chain)
     */
    function revealSecret(bytes32 auctionId, bytes32 secret) external {
        Auction storage auction = auctions[auctionId];
        if (keccak256(abi.encodePacked(secret)) != auction.hashlock) revert InvalidSecret();
        
        secrets[auctionId] = secret;
        
        // Transfer dest tokens to seller
        address resolver = resolvers[auctionId];
        if (resolver != address(0) && block.chainid == auction.destChainId) {
            uint256 amount = getCurrentPrice(auctionId);
            IERC20(auction.destToken).safeTransfer(auction.seller, amount);
        }
        
        emit AuctionRevealed(auctionId, secret);
    }

    /**
     * @notice Claim source tokens with revealed secret (called by resolver on src chain)
     */
    function claimWithSecret(bytes32 auctionId, bytes32 secret) external {
        Auction storage auction = auctions[auctionId];
        if (keccak256(abi.encodePacked(secret)) != auction.hashlock) revert InvalidSecret();
        
        // Transfer src tokens to resolver
        if (block.chainid == auction.srcChainId) {
            IERC20(auction.srcToken).safeTransfer(msg.sender, auction.srcAmount);
        }
        
        emit AuctionClaimed(auctionId, msg.sender);
    }

    /**
     * @notice Refund tokens if timelock expired
     */
    function refund(bytes32 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (block.timestamp < auction.timelock) revert TimelockNotExpired();
        
        if (block.chainid == auction.srcChainId && auction.active) {
            // Refund src tokens to seller
            IERC20(auction.srcToken).safeTransfer(auction.seller, auction.srcAmount);
            auction.active = false;
        } else if (block.chainid == auction.destChainId && resolvers[auctionId] != address(0)) {
            // Refund dest tokens to resolver
            uint256 amount = getCurrentPrice(auctionId);
            IERC20(auction.destToken).safeTransfer(resolvers[auctionId], amount);
        }
    }

    /**
     * @notice Get auction details
     */
    function getAuction(bytes32 auctionId) external view returns (
        address seller,
        address srcToken,
        uint256 srcAmount,
        uint256 srcChainId,
        address destToken,
        uint256 destChainId,
        uint256 currentPrice,
        bool isActive,
        bytes32 hashlock
    ) {
        Auction memory auction = auctions[auctionId];
        return (
            auction.seller,
            auction.srcToken,
            auction.srcAmount,
            auction.srcChainId,
            auction.destToken,
            auction.destChainId,
            auction.active ? getCurrentPrice(auctionId) : 0,
            auction.active,
            auction.hashlock
        );
    }
}