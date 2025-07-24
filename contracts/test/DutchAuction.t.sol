// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/DutchAuction.sol";

contract DutchAuctionTest is Test {
    DutchAuction public auction;
    
    address seller = address(0x1);
    address buyer = address(0x2);
    address token = address(0x3);
    
    uint256 constant START_PRICE = 1 ether;
    uint256 constant END_PRICE = 0.5 ether;
    uint256 constant DURATION = 1 hours;
    uint256 constant AMOUNT = 100e18;
    
    function setUp() public {
        auction = new DutchAuction();
        vm.deal(buyer, 10 ether);
    }
    
    function testCreateAuction() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        (
            uint256 startPrice,
            uint256 endPrice,
            uint256 startTime,
            uint256 duration,
            address auctionToken,
            uint256 auctionAmount,
            address auctionSeller,
            bool active
        ) = auction.auctions(auctionId);
        
        assertEq(startPrice, START_PRICE);
        assertEq(endPrice, END_PRICE);
        assertEq(startTime, block.timestamp);
        assertEq(duration, DURATION);
        assertEq(auctionToken, token);
        assertEq(auctionAmount, AMOUNT);
        assertEq(auctionSeller, seller);
        assertTrue(active);
    }
    
    function testCreateAuctionInvalidPriceRange() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        vm.expectRevert(DutchAuction.InvalidPriceRange.selector);
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            END_PRICE,
            START_PRICE,
            DURATION
        );
    }
    
    function testCreateAuctionInvalidDuration() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        vm.expectRevert(DutchAuction.InvalidDuration.selector);
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            0
        );
    }
    
    function testGetCurrentPrice() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        // At start
        assertEq(auction.getCurrentPrice(auctionId), START_PRICE);
        
        // Halfway through
        vm.warp(block.timestamp + DURATION / 2);
        uint256 expectedMidPrice = START_PRICE - (START_PRICE - END_PRICE) / 2;
        assertEq(auction.getCurrentPrice(auctionId), expectedMidPrice);
        
        // At end
        vm.warp(block.timestamp + DURATION / 2);
        assertEq(auction.getCurrentPrice(auctionId), END_PRICE);
    }
    
    function testSettleAuction() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        // Move halfway through auction
        vm.warp(block.timestamp + DURATION / 2);
        uint256 currentPrice = auction.getCurrentPrice(auctionId);
        uint256 totalCost = currentPrice * AMOUNT / 1e18;
        
        vm.prank(buyer);
        auction.settleAuction{value: totalCost}(auctionId);
        
        // Check auction is no longer active
        (,,,,,,,bool active) = auction.auctions(auctionId);
        assertFalse(active);
    }
    
    function testSettleAuctionInsufficientPayment() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        uint256 currentPrice = auction.getCurrentPrice(auctionId);
        uint256 totalCost = currentPrice * AMOUNT / 1e18;
        
        vm.prank(buyer);
        vm.expectRevert(DutchAuction.InsufficientPayment.selector);
        auction.settleAuction{value: totalCost - 1}(auctionId);
    }
    
    function testCancelAuction() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        vm.prank(seller);
        auction.cancelAuction(auctionId);
        
        (,,,,,,,bool active) = auction.auctions(auctionId);
        assertFalse(active);
    }
    
    function testCancelAuctionUnauthorized() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        vm.prank(buyer);
        vm.expectRevert(DutchAuction.UnauthorizedCaller.selector);
        auction.cancelAuction(auctionId);
    }
    
    function testIsAuctionActive() public {
        vm.prank(seller);
        bytes32 auctionId = keccak256("test_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        assertTrue(auction.isAuctionActive(auctionId));
        
        // After duration expires
        vm.warp(block.timestamp + DURATION + 1);
        assertFalse(auction.isAuctionActive(auctionId));
    }
    
    function testFuzzAuctionPricing(
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration,
        uint256 elapsed
    ) public {
        vm.assume(startPrice > endPrice);
        vm.assume(startPrice <= 1000 ether);
        vm.assume(endPrice >= 0.001 ether);
        vm.assume(duration > 0 && duration <= 7 days);
        vm.assume(elapsed <= duration);
        
        vm.prank(seller);
        bytes32 auctionId = keccak256("fuzz_auction");
        
        auction.createAuction(
            auctionId,
            token,
            AMOUNT,
            startPrice,
            endPrice,
            duration
        );
        
        vm.warp(block.timestamp + elapsed);
        uint256 currentPrice = auction.getCurrentPrice(auctionId);
        
        // Price should be between start and end
        assertGe(currentPrice, endPrice);
        assertLe(currentPrice, startPrice);
        
        // Price should decrease proportionally
        uint256 expectedPrice = startPrice - (startPrice - endPrice) * elapsed / duration;
        assertEq(currentPrice, expectedPrice);
    }
}