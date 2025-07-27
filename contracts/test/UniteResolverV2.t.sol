// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/SimpleDutchAuction.sol";
import "../src/SimpleUniteResolverV2.sol";
import "./MockToken.sol";

contract UniteResolverV2Test is Test {
    SimpleDutchAuction public auction;
    SimpleUniteResolverV2 public resolver;
    MockToken public token;
    
    address seller = address(0x1);
    address relayer = address(0x2);
    address resolverAddr = address(0x3);
    address buyer = address(0x4);
    
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
        resolver = new SimpleUniteResolverV2(address(auction));
        token = new MockToken("Test Token", "TEST");
        
        // Fund accounts
        vm.deal(seller, 10 ether);
        vm.deal(relayer, 10 ether);
        vm.deal(resolverAddr, 10 ether);
        vm.deal(buyer, 10 ether);
        
        // Mint tokens to seller
        token.mint(seller, AMOUNT * 10);
    }
    
    function testNewFlow() public {
        bytes32 auctionId = keccak256("test_auction_v2");
        uint256 dstChainId = 11155111; // Sepolia
        uint256 escrowDeadline = block.timestamp + 24 hours;
        
        // ========================================
        // STEP 1: User approves tokens to factory
        // ========================================
        console.log("STEP 1: User pre-approves tokens");
        vm.startPrank(seller);
        // In real implementation, this would be to EscrowFactory
        // For this test, we approve the resolver contract
        token.approve(address(resolver), AMOUNT);
        vm.stopPrank();
        
        // ========================================
        // STEP 2: Relayer posts auction WITHOUT escrow
        // ========================================
        console.log("STEP 2: Relayer posts auction (no escrow)");
        vm.prank(relayer);
        resolver.postAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        // Verify auction is active but no escrow exists
        assertTrue(resolver.isAuctionActive(auctionId));
        assertEq(resolver.auctionResolver(auctionId), address(0));
        
        // ========================================
        // STEP 3: Resolver creates escrow with deposit
        // ========================================
        console.log("STEP 3: Resolver creates escrow with safety deposit");
        vm.prank(resolverAddr);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT}(
            auctionId,
            dstChainId,
            HASHLOCK,
            escrowDeadline
        );
        
        // Verify exclusive lock
        assertEq(resolver.auctionResolver(auctionId), resolverAddr);
        
        // Verify escrow created
        bytes32 escrowId = resolver.auctionToEscrow(auctionId);
        assertTrue(escrowId != bytes32(0));
        
        (
            address escrowToken,
            uint256 escrowAmount,
            address escrowSeller,
            address escrowBuyer,
            address escrowResolver,
            ,,,,,
            uint256 safetyDeposit,
            ,
        ) = resolver.escrows(escrowId);
        
        assertEq(escrowToken, address(token));
        assertEq(escrowAmount, AMOUNT);
        assertEq(escrowSeller, relayer); // Relayer posted the auction
        assertEq(escrowBuyer, address(0)); // Not settled yet
        assertEq(escrowResolver, resolverAddr);
        assertEq(safetyDeposit, SAFETY_DEPOSIT);
        
        // ========================================
        // STEP 4: Resolver settles auction
        // ========================================
        console.log("STEP 4: Resolver settles auction (exclusive right)");
        
        // Move time forward to get a specific price
        vm.warp(block.timestamp + DURATION / 2);
        uint256 currentPrice = resolver.getAuctionPrice(auctionId);
        uint256 totalCost = currentPrice * AMOUNT / 1e18;
        
        // Only the exclusive resolver can settle
        vm.expectRevert(SimpleUniteResolverV2.NotAuctionResolver.selector);
        vm.prank(buyer);
        resolver.settleAuctionAsResolver{value: totalCost}(auctionId);
        
        // Resolver settles successfully
        vm.prank(resolverAddr);
        resolver.settleAuctionAsResolver{value: totalCost}(auctionId);
        
        // Verify buyer is set
        (,,,escrowBuyer,,,,,,,,,,) = resolver.escrows(escrowId);
        assertEq(escrowBuyer, resolverAddr);
        
        // ========================================
        // STEP 5: Seller moves funds after resolver commits
        // ========================================
        console.log("STEP 5: Seller moves funds to escrow");
        
        // Seller cannot move funds before auction is settled
        vm.expectRevert(SimpleUniteResolverV2.AuctionNotSettled.selector);
        vm.prank(relayer);
        resolver.moveSellerFunds{value: AMOUNT}(escrowId);
        
        // After settlement, seller moves funds
        vm.prank(relayer);
        resolver.moveSellerFunds{value: AMOUNT}(escrowId);
        
        (,,,,,,,,,,,, bool fundsMovedBySeller) = resolver.escrows(escrowId);
        assertTrue(fundsMovedBySeller);
        
        // ========================================
        // STEP 6: Seller reveals secret
        // ========================================
        console.log("STEP 6: Seller reveals secret after confirmations");
        
        // Cannot reveal before funds moved
        vm.expectRevert(SimpleUniteResolverV2.FundsNotMovedYet.selector);
        vm.prank(relayer);
        resolver.revealSecret(escrowId, SECRET);
        
        // After funds moved, reveal secret
        vm.prank(relayer);
        resolver.revealSecret(escrowId, SECRET);
        
        // ========================================
        // STEP 7: Resolver withdraws with secret
        // ========================================
        console.log("STEP 7: Resolver withdraws using revealed secret");
        
        uint256 resolverBalanceBefore = resolverAddr.balance;
        
        vm.prank(resolverAddr);
        resolver.withdrawWithSecret(escrowId, SECRET);
        
        // Verify resolver received funds + safety deposit
        uint256 expectedAmount = AMOUNT + SAFETY_DEPOSIT;
        assertEq(resolverAddr.balance - resolverBalanceBefore, expectedAmount);
        
        (,,,,,,,,,, bool withdrawn,,) = resolver.escrows(escrowId);
        assertTrue(withdrawn);
        
        console.log("✅ New flow test completed successfully!");
    }
    
    function testRefundAfterDeadline() public {
        bytes32 auctionId = keccak256("test_refund");
        uint256 escrowDeadline = block.timestamp + 1 hours;
        
        // Setup auction and escrow
        vm.prank(relayer);
        resolver.postAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        vm.prank(resolverAddr);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT}(
            auctionId,
            11155111,
            HASHLOCK,
            escrowDeadline
        );
        
        bytes32 escrowId = resolver.auctionToEscrow(auctionId);
        
        // Settle and move funds
        uint256 totalCost = resolver.getAuctionPrice(auctionId) * AMOUNT / 1e18;
        vm.prank(resolverAddr);
        resolver.settleAuctionAsResolver{value: totalCost}(auctionId);
        
        vm.prank(relayer);
        resolver.moveSellerFunds{value: AMOUNT}(escrowId);
        
        // Move past deadline
        vm.warp(block.timestamp + 2 hours);
        
        // Test refund
        uint256 sellerBalanceBefore = relayer.balance;
        uint256 resolverBalanceBefore = resolverAddr.balance;
        
        vm.prank(relayer);
        resolver.refundEscrow(escrowId);
        
        // Verify refunds
        assertEq(relayer.balance - sellerBalanceBefore, AMOUNT);
        assertEq(resolverAddr.balance - resolverBalanceBefore, SAFETY_DEPOSIT);
        
        (,,,,,,,,,,,, bool refunded) = resolver.escrows(escrowId);
        assertTrue(refunded);
    }
    
    function testOnlyResolverCanCreateEscrow() public {
        bytes32 auctionId = keccak256("test_exclusive");
        
        vm.prank(relayer);
        resolver.postAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        // First resolver creates escrow
        vm.prank(resolverAddr);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT}(
            auctionId,
            11155111,
            HASHLOCK,
            block.timestamp + 1 hours
        );
        
        // Another resolver tries to create escrow
        vm.expectRevert(SimpleUniteResolverV2.AuctionAlreadyHasResolver.selector);
        vm.prank(buyer);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT}(
            auctionId,
            11155111,
            HASHLOCK,
            block.timestamp + 1 hours
        );
    }
    
    function testInsufficientSafetyDeposit() public {
        bytes32 auctionId = keccak256("test_deposit");
        
        vm.prank(relayer);
        resolver.postAuction(
            auctionId,
            address(token),
            AMOUNT,
            START_PRICE,
            END_PRICE,
            DURATION
        );
        
        // Try with insufficient deposit
        vm.expectRevert(SimpleUniteResolverV2.InsufficientSafetyDeposit.selector);
        vm.prank(resolverAddr);
        resolver.createEscrowWithDeposit{value: SAFETY_DEPOSIT - 1}(
            auctionId,
            11155111,
            HASHLOCK,
            block.timestamp + 1 hours
        );
    }
}