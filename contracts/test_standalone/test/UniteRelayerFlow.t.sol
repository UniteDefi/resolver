// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/UniteRelayer.sol";
import "../src/MockEscrow.sol";
import "../src/MockToken.sol";

/**
 * @title UniteRelayerFlowTest - Test the complete relayer-orchestrated cross-chain swap flow
 * @notice Demonstrates the corrected architecture with centralized relayer service
 */
contract UniteRelayerFlowTest is Test {
    UniteRelayer public relayer;
    MockToken public srcToken;
    MockToken public dstToken;
    
    // Participants
    address user = address(0x1);
    address resolver1 = address(0x2);
    address resolver2 = address(0x3); // For rescue scenarios
    address relayerOwner = address(0x4);
    
    // Test parameters
    uint256 constant SRC_AMOUNT = 1000e18;
    uint256 constant MIN_DST_AMOUNT = 950e18;
    uint256 constant DST_AMOUNT = 1000e18; // What resolver will provide
    uint256 constant SAFETY_DEPOSIT = 0.001 ether;
    
    bytes32 constant SECRET = keccak256("test_secret_relayer_flow");
    bytes32 constant HASHLOCK = keccak256(abi.encodePacked(SECRET));
    
    function setUp() public {
        // Deploy contracts
        vm.prank(relayerOwner);
        relayer = new UniteRelayer();
        
        srcToken = new MockToken("Source Token", "SRC", 18);
        dstToken = new MockToken("Destination Token", "DST", 18);
        
        // Fund accounts
        vm.deal(user, 10 ether);
        vm.deal(resolver1, 10 ether);
        vm.deal(resolver2, 10 ether);
        vm.deal(relayerOwner, 10 ether);
        
        // Mint tokens
        srcToken.mint(user, SRC_AMOUNT * 10);
        dstToken.mint(resolver1, DST_AMOUNT * 10);
        dstToken.mint(resolver2, DST_AMOUNT * 10);
        
        // Register resolvers
        vm.startPrank(relayerOwner);
        relayer.registerResolver(resolver1);
        relayer.registerResolver(resolver2);
        vm.stopPrank();
    }
    
    function testCompleteRelayerOrchestration() public {
        console.log("=== TESTING RELAYER-ORCHESTRATED CROSS-CHAIN SWAP ===");
        
        // ========================================
        // STEP 1: User approves relayer and submits order
        // ========================================
        console.log("STEP 1: User approves relayer and submits order");
        
        vm.startPrank(user);
        srcToken.approve(address(relayer), SRC_AMOUNT);
        
        uint256 orderId = relayer.submitOrder(
            address(srcToken),
            SRC_AMOUNT,
            address(dstToken),
            MIN_DST_AMOUNT,
            1, // src chain
            2, // dst chain
            HASHLOCK,
            block.timestamp + 24 hours
        );
        vm.stopPrank();
        
        assertEq(orderId, 0);
        
        (UniteRelayer.Order memory order,) = relayer.getOrder(orderId);
        assertEq(uint(order.status), uint(UniteRelayer.OrderStatus.Pending));
        assertEq(order.user, user);
        assertEq(order.srcAmount, SRC_AMOUNT);
        
        console.log("Order submitted with ID:", orderId);
        
        // ========================================
        // STEP 2: Resolver commits through relayer API (with safety deposit)
        // ========================================
        console.log("STEP 2: Resolver commits to order");
        
        vm.prank(resolver1);
        relayer.commitToOrder{value: SAFETY_DEPOSIT}(orderId);
        
        (order,) = relayer.getOrder(orderId);
        assertEq(uint(order.status), uint(UniteRelayer.OrderStatus.Committed));
        
        (, UniteRelayer.Commitment memory commitment) = relayer.getOrder(orderId);
        assertEq(commitment.resolver, resolver1);
        assertEq(commitment.executionDeadline, block.timestamp + 5 minutes);
        
        console.log("Resolver committed with 5-minute execution window");
        
        // ========================================
        // STEP 3: Resolver deploys escrows on both chains (simulated)
        // ========================================
        console.log("STEP 3: Resolver deploys escrows on both chains");
        
        // Deploy mock escrows
        MockEscrow srcEscrow = new MockEscrow(
            address(srcToken),
            SRC_AMOUNT,
            resolver1, // resolver will receive from src
            HASHLOCK,
            block.timestamp + 12 hours,
            address(relayer) // relayer will deposit user funds
        );
        
        MockEscrow dstEscrow = new MockEscrow(
            address(dstToken),
            DST_AMOUNT,
            user, // user will receive on dst
            HASHLOCK,
            block.timestamp + 6 hours,
            resolver1 // resolver deposits their own funds
        );
        
        // Resolver notifies relayer about escrow deployment
        vm.prank(resolver1);
        relayer.notifyEscrowsDeployed(orderId, address(srcEscrow), address(dstEscrow));
        
        (order,) = relayer.getOrder(orderId);
        assertEq(uint(order.status), uint(UniteRelayer.OrderStatus.Executing));
        
        (, commitment) = relayer.getOrder(orderId);
        assertEq(commitment.srcEscrow, address(srcEscrow));
        assertEq(commitment.dstEscrow, address(dstEscrow));
        
        console.log("Escrows deployed and registered with relayer");
        
        // ========================================
        // STEP 4: Relayer transfers user's pre-approved funds to source escrow
        // ========================================
        console.log("STEP 4: Relayer transfers user funds to source escrow");
        
        uint256 userBalanceBefore = srcToken.balanceOf(user);
        
        // Anyone can call this after escrows are deployed
        relayer.transferUserFunds(orderId);
        
        // Verify funds transferred
        assertEq(srcToken.balanceOf(user), userBalanceBefore - SRC_AMOUNT);
        assertEq(srcToken.balanceOf(address(srcEscrow)), SRC_AMOUNT);
        
        (, commitment) = relayer.getOrder(orderId);
        assertTrue(commitment.fundsTransferred);
        
        console.log("User funds transferred to source escrow");
        
        // ========================================
        // STEP 5: Resolver deposits their funds to destination escrow
        // ========================================
        console.log("STEP 5: Resolver deposits funds to destination escrow");
        
        vm.startPrank(resolver1);
        dstToken.approve(address(dstEscrow), DST_AMOUNT);
        dstEscrow.deposit();
        vm.stopPrank();
        
        assertTrue(dstEscrow.isFunded());
        
        console.log("Resolver funds deposited to destination escrow");
        
        // ========================================
        // STEP 6: Relayer reveals secret on destination chain
        // ========================================
        console.log("STEP 6: Relayer reveals secret (user gets funds + resolver gets deposit back)");
        
        uint256 relayerBalanceBefore = relayerOwner.balance;
        uint256 userDstBalanceBefore = dstToken.balanceOf(user);
        
        // Relayer reveals secret to complete the swap
        vm.prank(relayerOwner);
        relayer.revealSecret(orderId, SECRET);
        
        (order,) = relayer.getOrder(orderId);
        assertEq(uint(order.status), uint(UniteRelayer.OrderStatus.Completed));
        
        // Verify resolver got safety deposit back (sent to resolver1)
        assertEq(resolver1.balance, 10 ether); // Got safety deposit back
        
        console.log("Secret revealed, order completed");
        
        // ========================================
        // STEP 7: User withdraws from destination escrow using revealed secret
        // ========================================
        console.log("STEP 7: User withdraws from destination using revealed secret");
        
        vm.prank(user);
        dstEscrow.withdraw(SECRET);
        
        assertEq(dstToken.balanceOf(user), userDstBalanceBefore + DST_AMOUNT);
        assertTrue(dstEscrow.withdrawn());
        
        console.log("User successfully received destination tokens");
        
        // ========================================
        // STEP 8: Resolver withdraws from source escrow using same secret
        // ========================================
        console.log("STEP 8: Resolver withdraws from source using revealed secret");
        
        uint256 resolverSrcBalanceBefore = srcToken.balanceOf(resolver1);
        
        vm.prank(resolver1);
        srcEscrow.withdraw(SECRET);
        
        assertEq(srcToken.balanceOf(resolver1), resolverSrcBalanceBefore + SRC_AMOUNT);
        assertTrue(srcEscrow.withdrawn());
        
        console.log("Resolver successfully received source tokens");
        console.log("CROSS-CHAIN SWAP COMPLETED SUCCESSFULLY!");
    }
    
    function testRescueMechanism() public {
        console.log("=== TESTING RESCUE MECHANISM ===");
        
        // Setup order and commitment
        vm.startPrank(user);
        srcToken.approve(address(relayer), SRC_AMOUNT);
        uint256 orderId = relayer.submitOrder(
            address(srcToken),
            SRC_AMOUNT,
            address(dstToken),
            MIN_DST_AMOUNT,
            1, 2, HASHLOCK,
            block.timestamp + 24 hours
        );
        vm.stopPrank();
        
        // Resolver1 commits but fails to execute
        vm.prank(resolver1);
        relayer.commitToOrder{value: SAFETY_DEPOSIT}(orderId);
        
        console.log("Resolver1 committed but will fail to execute");
        
        // Verify rescue is not possible yet
        assertFalse(relayer.canRescue(orderId));
        
        // Fast forward past execution deadline
        vm.warp(block.timestamp + 6 minutes);
        
        // Now rescue should be possible
        assertTrue(relayer.canRescue(orderId));
        
        console.log("After 5 minutes, rescue is now available");
        
        // ========================================
        // Resolver2 rescues the order
        // ========================================
        console.log("Resolver2 rescues the failed order");
        
        // Deploy new escrows for rescue
        MockEscrow newSrcEscrow = new MockEscrow(
            address(srcToken), SRC_AMOUNT, resolver2, HASHLOCK,
            block.timestamp + 12 hours, address(relayer)
        );
        
        MockEscrow newDstEscrow = new MockEscrow(
            address(dstToken), DST_AMOUNT, user, HASHLOCK,
            block.timestamp + 6 hours, resolver2
        );
        
        vm.prank(resolver2);
        relayer.rescueOrder{value: SAFETY_DEPOSIT}(
            orderId,
            address(newSrcEscrow),
            address(newDstEscrow)
        );
        
        (UniteRelayer.Order memory order, UniteRelayer.Commitment memory commitment) = relayer.getOrder(orderId);
        assertEq(uint(order.status), uint(UniteRelayer.OrderStatus.Rescued));
        assertEq(commitment.resolver, resolver2);
        assertTrue(commitment.rescued);
        
        console.log("Order successfully rescued by resolver2");
        console.log("Original resolver1 loses safety deposit as penalty");
        console.log("Resolver2 can now complete the order and earn penalty reward");
    }
    
    function testExecutionTimeout() public {
        console.log("=== TESTING EXECUTION TIMEOUT ===");
        
        // Setup and commit
        vm.startPrank(user);
        srcToken.approve(address(relayer), SRC_AMOUNT);
        uint256 orderId = relayer.submitOrder(
            address(srcToken), SRC_AMOUNT, address(dstToken), MIN_DST_AMOUNT,
            1, 2, HASHLOCK, block.timestamp + 24 hours
        );
        vm.stopPrank();
        
        vm.prank(resolver1);
        relayer.commitToOrder{value: SAFETY_DEPOSIT}(orderId);
        
        // Try to deploy escrows after timeout
        vm.warp(block.timestamp + 6 minutes);
        
        MockEscrow srcEscrow = new MockEscrow(
            address(srcToken), SRC_AMOUNT, resolver1, HASHLOCK,
            block.timestamp + 12 hours, address(relayer)
        );
        
        MockEscrow dstEscrow = new MockEscrow(
            address(dstToken), DST_AMOUNT, user, HASHLOCK,
            block.timestamp + 6 hours, resolver1
        );
        
        // Should fail due to timeout
        vm.expectRevert(UniteRelayer.ExecutionTimeExpired.selector);
        vm.prank(resolver1);
        relayer.notifyEscrowsDeployed(orderId, address(srcEscrow), address(dstEscrow));
        
        console.log("Execution timeout properly enforced");
    }
    
    function testUnauthorizedResolverActions() public {
        console.log("=== TESTING UNAUTHORIZED RESOLVER ACTIONS ===");
        
        address unauthorizedResolver = address(0x999);
        vm.deal(unauthorizedResolver, 10 ether);
        
        vm.startPrank(user);
        srcToken.approve(address(relayer), SRC_AMOUNT);
        uint256 orderId = relayer.submitOrder(
            address(srcToken), SRC_AMOUNT, address(dstToken), MIN_DST_AMOUNT,
            1, 2, HASHLOCK, block.timestamp + 24 hours
        );
        vm.stopPrank();
        
        // Unauthorized resolver tries to commit
        vm.expectRevert(UniteRelayer.OnlyRegisteredResolver.selector);
        vm.prank(unauthorizedResolver);
        relayer.commitToOrder{value: SAFETY_DEPOSIT}(orderId);
        
        console.log("Unauthorized resolver actions properly blocked");
    }
    
    function testInsufficientSafetyDeposit() public {
        vm.startPrank(user);
        srcToken.approve(address(relayer), SRC_AMOUNT);
        uint256 orderId = relayer.submitOrder(
            address(srcToken), SRC_AMOUNT, address(dstToken), MIN_DST_AMOUNT,
            1, 2, HASHLOCK, block.timestamp + 24 hours
        );
        vm.stopPrank();
        
        // Try to commit with insufficient safety deposit
        vm.expectRevert(UniteRelayer.InsufficientSafetyDeposit.selector);
        vm.prank(resolver1);
        relayer.commitToOrder{value: SAFETY_DEPOSIT - 1}(orderId);
        
        console.log("Insufficient safety deposit properly rejected");
    }
}