// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library DutchAuctionLib {
    error AuctionNotStarted();
    error AuctionEnded();
    error InvalidAuctionParameters();

    /**
     * @dev Calculate the current price based on Dutch auction parameters
     * @param startPrice The starting price (higher)
     * @param endPrice The ending price (lower)
     * @param auctionStartTime When the auction started
     * @param auctionEndTime When the auction ends
     * @param currentTime Current block timestamp
     * @return currentPrice The current price based on linear decay
     */
    function getCurrentPrice(
        uint256 startPrice,
        uint256 endPrice,
        uint256 auctionStartTime,
        uint256 auctionEndTime,
        uint256 currentTime
    ) internal pure returns (uint256 currentPrice) {
        if (currentTime < auctionStartTime) {
            revert AuctionNotStarted();
        }
        
        if (currentTime >= auctionEndTime) {
            return endPrice;
        }
        
        if (auctionEndTime <= auctionStartTime || startPrice <= endPrice) {
            revert InvalidAuctionParameters();
        }
        
        uint256 timeElapsed = currentTime - auctionStartTime;
        uint256 totalDuration = auctionEndTime - auctionStartTime;
        uint256 priceDecrease = startPrice - endPrice;
        
        // Linear price decay: currentPrice = startPrice - (priceDecrease * timeElapsed / totalDuration)
        currentPrice = startPrice - (priceDecrease * timeElapsed / totalDuration);
    }

    /**
     * @dev Calculate the taking amount based on current auction price
     * @param makingAmount The amount being made (sold)
     * @param startPrice The starting price 
     * @param endPrice The ending price
     * @param auctionStartTime When the auction started
     * @param auctionEndTime When the auction ends
     * @param currentTime Current block timestamp
     * @return takingAmount The amount to be taken (bought) at current price
     */
    function calculateTakingAmount(
        uint256 makingAmount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 auctionStartTime,
        uint256 auctionEndTime,
        uint256 currentTime
    ) internal pure returns (uint256 takingAmount) {
        uint256 currentPrice = getCurrentPrice(
            startPrice,
            endPrice,
            auctionStartTime,
            auctionEndTime,
            currentTime
        );
        
        // takingAmount = makingAmount * currentPrice / 1e18 (assuming 18 decimal precision)
        takingAmount = (makingAmount * currentPrice) / 1e18;
    }
}