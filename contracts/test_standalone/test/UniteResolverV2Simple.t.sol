// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/SimpleDutchAuction.sol";
import "../src/UniteResolverV2Simple.sol";
import "../src/MockToken.sol";

contract UniteResolverV2SimpleTest is Test {
    SimpleDutchAuction public auction;
    UniteResolverV2Simple public resolver;
    MockToken public token;
    
    address seller = address(0x1);
    address relayer = address(0x2);
    address resolverAddr = address(0x3);
    
    uint256 constant START_PRICE = 1 ether;
    uint256 constant END_PRICE = 0.5 ether;
    uint256 constant DURATION = 1 hours;
    uint256 constant AMOUNT = 100e18;
    uint256 constant SAFETY_DEPOSIT = 0.001 ether;
    
    bytes32 constant SECRET = keccak256("test_secret");
    bytes32 constant HASHLOCK = keccak256(abi.encodePacked(SECRET));
    
    function setUp() public {
        // Deploy contracts
        auction = new SimpleDutchAuction();
        resolver = new UniteResolverV2Simple(address(auction));
        token = new MockToken("Test Token", "TEST", 18);
        
        // Fund accounts
        vm.deal(seller, 10 ether);
        vm.deal(relayer, 10 ether);
        vm.deal(resolverAddr, 10 ether);
        
        // Mint tokens to seller
        token.mint(seller, AMOUNT * 10);
    }
    
    function testCompleteNewFlow() public {
        bytes32 auctionId = keccak256("test_auction_new_flow");
        uint256 dstChainId = 11155111; // Sepolia
        
        console.log("=== TESTING NEW UNITEDEFI ARCHITECTURE ===");
        
        // ========================================
        // STEP 1: User approves tokens to resolver
        // ========================================
        console.log("STEP 1: User pre-approves tokens to resolver");
        vm.startPrank(seller);
        token.approve(address(resolver), AMOUNT);
        vm.stopPrank();
        
        // Verify approval
        assertTrue(resolver.hasUserApproved(seller, address(token), AMOUNT));
        
        // ========================================
        // STEP 2: Relayer posts auction WITHOUT escrow
        // ========================================
        console.log("STEP 2: Relayer posts auction (no escrow creation)");
        vm.prank(seller); // Seller posts auction
        resolver.postCrossChainAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION,
            dstChainId,
            HASHLOCK
        );
        
        // Verify auction is active but no resolver assigned
        assertTrue(resolver.isAuctionActive(auctionId));
        assertEq(resolver.auctionResolver(auctionId), address(0));
        
        // Verify auction data
        (
            address auctionSeller,
            address auctionToken,
            uint256 auctionAmount,
            uint256 auctionDstChainId,
            bool auctionActive,
            address auctionResolverAddr
        ) = resolver.getAuction(auctionId);
        
        assertEq(auctionSeller, seller);
        assertEq(auctionToken, address(token));
        assertEq(auctionAmount, AMOUNT);
        assertEq(auctionDstChainId, dstChainId);
        assertTrue(auctionActive);
        assertEq(auctionResolverAddr, address(0));
        
        // ========================================
        // STEP 3: Resolver creates escrow with deposit
        // ========================================
        console.log("STEP 3: Resolver creates escrow with safety deposit");
        
        vm.prank(resolverAddr);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT}(auctionId);
        
        // Verify exclusive lock
        assertEq(resolver.auctionResolver(auctionId), resolverAddr);
        
        // Verify escrow created
        (, , , , , address assignedResolver) = resolver.getAuction(auctionId);
        assertEq(assignedResolver, resolverAddr);
        
        // ========================================
        // STEP 4: Test exclusive resolver rights
        // ========================================
        console.log("STEP 4: Testing exclusive resolver rights");
        
        // Move time forward for price decrease
        vm.warp(block.timestamp + DURATION / 2);
        uint256 currentPrice = resolver.getCurrentPrice(auctionId);
        uint256 totalCost = currentPrice * AMOUNT / 1e18;
        
        // Fund accounts with enough ETH for the test
        vm.deal(seller, totalCost + 1 ether);
        vm.deal(resolverAddr, totalCost + 1 ether);
        
        // Another address tries to settle - should fail
        vm.prank(seller);
        vm.expectRevert(UniteResolverV2Simple.NotAuctionResolver.selector);
        resolver.settleAuctionAsResolver{value: totalCost}(auctionId);
        
        // Correct resolver settles successfully
        vm.prank(resolverAddr);
        resolver.settleAuctionAsResolver{value: totalCost}(auctionId);
        
        // Verify auction is no longer active
        (, , , , bool isActive,) = resolver.getAuction(auctionId);
        assertFalse(isActive);
        
        // ========================================
        // STEP 5: Seller transfers tokens
        // ========================================
        console.log("STEP 5: Seller transfers tokens to escrow");
        
        vm.prank(seller);
        resolver.transferTokensFromSeller(auctionId);
        
        // Verify tokens were transferred
        assertEq(token.balanceOf(address(resolver)), AMOUNT);
        assertEq(token.balanceOf(seller), AMOUNT * 10 - AMOUNT);
        
        // ========================================
        // STEP 6: Complete swap
        // ========================================
        console.log("STEP 6: Resolver completes swap");
        
        uint256 resolverBalanceBefore = resolverAddr.balance;
        uint256 resolverTokensBefore = token.balanceOf(resolverAddr);
        
        vm.prank(resolverAddr);
        resolver.completeSwap(auctionId);
        
        // Verify resolver received tokens and safety deposit
        assertEq(token.balanceOf(resolverAddr), resolverTokensBefore + AMOUNT);
        assertEq(resolverAddr.balance, resolverBalanceBefore + SAFETY_DEPOSIT);
        
        console.log(" Complete new flow test passed!");
    }
    
    function testOnlyOneResolverPerAuction() public {
        bytes32 auctionId = keccak256("test_exclusive_resolver");
        
        // Post auction
        vm.prank(seller);
        token.approve(address(resolver), AMOUNT);
        
        vm.prank(seller);
        resolver.postCrossChainAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION,
            11155111,
            HASHLOCK
        );
        
        // First resolver creates escrow
        vm.prank(resolverAddr);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT}(auctionId);
        
        // Second resolver tries to create escrow - should fail
        address secondResolver = address(0x4);
        vm.deal(secondResolver, 1 ether);
        
        vm.expectRevert(UniteResolverV2Simple.EscrowAlreadyCreated.selector);
        vm.prank(secondResolver);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT}(auctionId);
    }
    
    function testInsufficientSafetyDeposit() public {
        bytes32 auctionId = keccak256("test_insufficient_deposit");
        
        // Post auction
        vm.prank(seller);
        token.approve(address(resolver), AMOUNT);
        
        vm.prank(seller);
        resolver.postCrossChainAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION,
            11155111,
            HASHLOCK
        );
        
        // Try with insufficient deposit
        vm.expectRevert(UniteResolverV2Simple.InsufficientSafetyDeposit.selector);
        vm.prank(resolverAddr);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT - 1}(auctionId);
    }
    
    function testUserMustApproveTokensFirst() public {
        bytes32 auctionId = keccak256("test_approval_required");
        
        // Try to post auction without approval
        vm.expectRevert(UniteResolverV2Simple.UserHasNotApprovedFactory.selector);
        vm.prank(seller);
        resolver.postCrossChainAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION,
            11155111,
            HASHLOCK
        );
    }
    
    function testPriceDecreaseOverTime() public {
        bytes32 auctionId = keccak256("test_price_decrease");
        
        // Setup
        vm.prank(seller);
        token.approve(address(resolver), AMOUNT);
        
        vm.prank(seller);
        resolver.postCrossChainAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION,
            11155111,
            HASHLOCK
        );
        
        // Price at start
        uint256 priceStart = resolver.getCurrentPrice(auctionId);
        assertEq(priceStart, START_PRICE);
        
        // Price halfway through
        vm.warp(block.timestamp + DURATION / 2);
        uint256 priceMid = resolver.getCurrentPrice(auctionId);
        uint256 expectedMid = START_PRICE - (START_PRICE - END_PRICE) / 2;
        assertEq(priceMid, expectedMid);
        
        // Price at end
        vm.warp(block.timestamp + DURATION / 2);
        uint256 priceEnd = resolver.getCurrentPrice(auctionId);
        assertEq(priceEnd, END_PRICE);
    }
}