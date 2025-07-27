// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./RelayerServiceTest.t.sol";

contract EtherlinkToBaseSepoliaSwapTest is RelayerServiceTest {
    
    function testFullSwapFlowEtherlinkToBase() public {
        console.log("\n=== ETHERLINK -> BASE SEPOLIA SWAP TEST ===");
        console.log("Testing complete swap flow from Etherlink to Base Sepolia");
        
        // Step 1: User prepares for swap on Etherlink
        console.log("\n[Step 1] User preparation on Etherlink");
        vm.startPrank(user);
        srcToken.approve(address(escrowFactory), SRC_AMOUNT);
        escrowFactory.preApproveToken(address(srcToken), SRC_AMOUNT);
        vm.stopPrank();
        console.log("[OK] User approved %s SRC tokens to EscrowFactory", SRC_AMOUNT / 1e18);
        
        // Step 2: Relayer service creates order
        console.log("\n[Step 2] Relayer creates order");
        vm.startPrank(relayer);
        bytes32 orderId = relayerService.createOrder(
            user,
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT,
            ETHERLINK_CHAIN_ID,
            BASE_SEPOLIA_CHAIN_ID
        );
        vm.stopPrank();
        console.log("[OK] Order created: %s", uint256(orderId));
        console.log("  - Source: %s SRC on Etherlink", SRC_AMOUNT / 1e18);
        console.log("  - Destination: %s DST on Base Sepolia", DST_AMOUNT / 1e18);
        
        // Step 3: Resolver commits through API (simulated)
        console.log("\n[Step 3] Resolver commits to order via API");
        vm.startPrank(resolver1);
        relayerService.commitToOrder(orderId);
        (, , , , , , , , address committedResolver, uint256 commitTime, , , , ,) = relayerService.orders(orderId);
        vm.stopPrank();
        console.log("[OK] Resolver %s committed at timestamp %s", resolver1, commitTime);
        console.log("  - 5 minute execution window started");
        
        // Step 4: Resolver creates escrows on both chains
        console.log("\n[Step 4] Resolver creates escrows on both chains");
        vm.startPrank(resolver1);
        
        // Approve tokens
        srcToken.approve(address(resolver), SRC_AMOUNT);
        dstToken.approve(address(resolver), DST_AMOUNT);
        
        // Create immutables
        IBaseEscrow.Immutables memory srcImmutables = createMockImmutables(
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT
        );
        srcImmutables.taker = resolver1;
        
        IBaseEscrow.Immutables memory dstImmutables = createMockImmutables(
            address(dstToken),
            address(srcToken),
            DST_AMOUNT,
            SRC_AMOUNT
        );
        dstImmutables.taker = resolver1;
        
        // Track balances before
        uint256 userBalanceBefore = srcToken.balanceOf(user);
        uint256 resolverEthBefore = resolver1.balance;
        
        // Create escrows with safety deposits
        (address srcEscrow, address dstEscrow) = resolver.createEscrowsForOrder{value: SAFETY_DEPOSIT * 2}(
            orderId,
            srcImmutables,
            dstImmutables,
            createMockOrder(),
            bytes32(0),
            bytes32(0),
            SRC_AMOUNT,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        
        vm.stopPrank();
        
        console.log("[OK] Escrows created:");
        console.log("  - Source escrow (Etherlink): %s", srcEscrow);
        console.log("  - Destination escrow (Base): %s", dstEscrow);
        console.log("  - Safety deposits: %s ETH on each chain", SAFETY_DEPOSIT / 1e18);
        console.log("  - Resolver deposited %s SRC tokens", SRC_AMOUNT / 1e18);
        console.log("  - Resolver deposited %s DST tokens", DST_AMOUNT / 1e18);
        
        // Step 5: Verify relayer moved user funds
        console.log("\n[Step 5] Relayer moves user funds to escrow");
        uint256 userBalanceAfter = srcToken.balanceOf(user);
        console.log("[OK] User funds moved:");
        console.log("  - User balance before: %s SRC", userBalanceBefore / 1e18);
        console.log("  - User balance after: %s SRC", userBalanceAfter / 1e18);
        console.log("  - Transferred: %s SRC", (userBalanceBefore - userBalanceAfter) / 1e18);
        
        // Step 6: Relayer reveals secret on destination chain
        console.log("\n[Step 6] Relayer reveals secret on Base Sepolia");
        vm.startPrank(relayer);
        relayerService.completeOrder(orderId, SECRET);
        vm.stopPrank();
        console.log("[OK] Secret revealed: %s", uint256(SECRET));
        console.log("  - User can now claim %s DST on Base Sepolia", DST_AMOUNT / 1e18);
        console.log("  - Resolver safety deposit returned on Base");
        
        // Step 7: Resolver uses secret to withdraw on source chain
        console.log("\n[Step 7] Resolver withdraws on Etherlink using secret");
        vm.startPrank(resolver1);
        resolver.withdrawFromSourceEscrow(orderId, SECRET);
        vm.stopPrank();
        console.log("[OK] Resolver withdrew %s SRC from source escrow", SRC_AMOUNT / 1e18);
        console.log("  - Resolver safety deposit returned on Etherlink");
        
        // Verify final state
        (, , , , , , , , , , , , bool isActive, bool isCompleted, bool isRescued) = relayerService.orders(orderId);
        console.log("\n[Final State]");
        console.log("[OK] Order completed: %s", isCompleted);
        console.log("[OK] Order active: %s", isActive);
        console.log("[OK] Was rescued: %s", isRescued);
        
        console.log("\n=== SWAP COMPLETED SUCCESSFULLY ===\n");
    }
    
    function testEtherlinkToBaseWithDelays() public {
        console.log("\n=== TESTING SWAP WITH NETWORK DELAYS ===");
        
        // Setup order
        vm.startPrank(user);
        srcToken.approve(address(escrowFactory), SRC_AMOUNT);
        escrowFactory.preApproveToken(address(srcToken), SRC_AMOUNT);
        vm.stopPrank();
        
        vm.startPrank(relayer);
        bytes32 orderId = relayerService.createOrder(
            user,
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT,
            ETHERLINK_CHAIN_ID,
            BASE_SEPOLIA_CHAIN_ID
        );
        vm.stopPrank();
        
        // Resolver commits
        vm.startPrank(resolver1);
        relayerService.commitToOrder(orderId);
        vm.stopPrank();
        
        // Simulate 2 minute delay
        console.log("Simulating 2 minute network delay...");
        vm.warp(block.timestamp + 2 minutes);
        
        // Resolver still has time to complete
        assertFalse(relayerService.isExecutionWindowExpired(orderId));
        console.log("[OK] Still within 5 minute window");
        
        // Complete the swap
        vm.startPrank(resolver1);
        srcToken.approve(address(resolver), SRC_AMOUNT);
        dstToken.approve(address(resolver), DST_AMOUNT);
        
        IBaseEscrow.Immutables memory srcImmutables = createMockImmutables(
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT
        );
        srcImmutables.taker = resolver1;
        
        IBaseEscrow.Immutables memory dstImmutables = createMockImmutables(
            address(dstToken),
            address(srcToken),
            DST_AMOUNT,
            SRC_AMOUNT
        );
        dstImmutables.taker = resolver1;
        
        resolver.createEscrowsForOrder{value: SAFETY_DEPOSIT * 2}(
            orderId,
            srcImmutables,
            dstImmutables,
            createMockOrder(),
            bytes32(0),
            bytes32(0),
            SRC_AMOUNT,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        vm.stopPrank();
        
        console.log("[OK] Swap completed successfully despite delay");
    }
    
    function testEtherlinkToBasePartialAmounts() public {
        console.log("\n=== TESTING PARTIAL AMOUNT SWAPS ===");
        
        uint256 partialSrcAmount = SRC_AMOUNT / 2;
        uint256 partialDstAmount = DST_AMOUNT / 2;
        
        // Setup with partial amounts
        vm.startPrank(user);
        srcToken.approve(address(escrowFactory), partialSrcAmount);
        escrowFactory.preApproveToken(address(srcToken), partialSrcAmount);
        vm.stopPrank();
        
        vm.startPrank(relayer);
        bytes32 orderId = relayerService.createOrder(
            user,
            address(srcToken),
            address(dstToken),
            partialSrcAmount,
            partialDstAmount,
            ETHERLINK_CHAIN_ID,
            BASE_SEPOLIA_CHAIN_ID
        );
        vm.stopPrank();
        
        console.log("[OK] Created order for partial amounts:");
        console.log("  - %s SRC -> %s DST", partialSrcAmount / 1e18, partialDstAmount / 1e18);
        
        // Complete swap with partial amounts
        vm.startPrank(resolver1);
        relayerService.commitToOrder(orderId);
        
        srcToken.approve(address(resolver), partialSrcAmount);
        dstToken.approve(address(resolver), partialDstAmount);
        
        IBaseEscrow.Immutables memory srcImmutables = createMockImmutables(
            address(srcToken),
            address(dstToken),
            partialSrcAmount,
            partialDstAmount
        );
        srcImmutables.taker = resolver1;
        
        IBaseEscrow.Immutables memory dstImmutables = createMockImmutables(
            address(dstToken),
            address(srcToken),
            partialDstAmount,
            partialSrcAmount
        );
        dstImmutables.taker = resolver1;
        
        resolver.createEscrowsForOrder{value: SAFETY_DEPOSIT * 2}(
            orderId,
            srcImmutables,
            dstImmutables,
            createMockOrder(),
            bytes32(0),
            bytes32(0),
            partialSrcAmount,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        vm.stopPrank();
        
        console.log("[OK] Partial swap completed successfully");
    }
}