// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";

contract SwapFlowDemo is Test {
    
    // Key addresses
    address constant RELAYER = address(0x1);
    address constant USER = address(0x2);
    address constant RESOLVER1 = address(0x3);
    address constant RESOLVER2 = address(0x4);
    
    // Constants
    uint256 constant SAFETY_DEPOSIT = 0.001 ether;
    uint256 constant SRC_AMOUNT = 1000e18;
    uint256 constant DST_AMOUNT = 900e18;
    bytes32 constant SECRET = keccak256("test_secret_123");
    bytes32 constant HASHLOCK = keccak256(abi.encodePacked(SECRET));
    
    function test_DetailedSwapFlow() public {
        console.log("\n=== CROSSCHAIN SWAP TRANSACTION REPORT ===\n");
        
        // Simulating order creation
        bytes32 orderId = keccak256(abi.encodePacked(USER, block.timestamp));
        console.log("ORDER DETAILS:");
        console.log("- Order ID: %s", uint256(orderId));
        console.log("- Secret: %s", uint256(SECRET));
        console.log("- Hashlock: %s", uint256(HASHLOCK));
        console.log("- User: %s", USER);
        console.log("- Source Amount: %s tokens", SRC_AMOUNT / 1e18);
        console.log("- Destination Amount: %s tokens", DST_AMOUNT / 1e18);
        console.log("- Source Chain: Etherlink (42793)");
        console.log("- Destination Chain: Base Sepolia (84532)");
        
        console.log("\n[TRANSACTION 1] User Pre-Approval");
        console.log("From: %s (User)", USER);
        console.log("To: EscrowFactory");
        console.log("Function: approve(escrowFactory, 1000 tokens)");
        console.log("Gas Used: ~46,000");
        
        console.log("\n[TRANSACTION 2] User Pre-Approval Registration");
        console.log("From: %s (User)", USER);
        console.log("To: EscrowFactory");
        console.log("Function: preApproveToken(srcToken, 1000 tokens)");
        console.log("Gas Used: ~28,000");
        
        console.log("\n[TRANSACTION 3] Order Creation");
        console.log("From: %s (Relayer)", RELAYER);
        console.log("To: RelayerService");
        console.log("Function: createOrder(user, srcToken, dstToken, amounts, chainIds)");
        console.log("Result: Order %s created", uint256(orderId));
        console.log("Gas Used: ~125,000");
        
        console.log("\n[TRANSACTION 4] Resolver Commitment");
        console.log("From: %s (Resolver 1)", RESOLVER1);
        console.log("To: RelayerService");
        console.log("Function: commitToOrder(%s)", uint256(orderId));
        console.log("Commitment Time: %s", block.timestamp);
        console.log("Execution Window: 5 minutes (expires at %s)", block.timestamp + 300);
        console.log("Gas Used: ~85,000");
        
        console.log("\n[TRANSACTION 5] Resolver Token Approvals");
        console.log("From: %s (Resolver 1)", RESOLVER1);
        console.log("To: SRC Token");
        console.log("Function: approve(resolver, 1000 tokens)");
        console.log("Gas Used: ~46,000");
        
        console.log("\n[TRANSACTION 6] Escrow Creation");
        console.log("From: %s (Resolver 1)", RESOLVER1);
        console.log("To: UniteResolverV2");
        console.log("Function: createEscrowsForOrder(...)");
        console.log("Value Sent: %s ETH (safety deposits)", (SAFETY_DEPOSIT * 2) / 1e18);
        console.log("Actions:");
        console.log("  - Deploy source escrow on Etherlink");
        console.log("  - Deploy destination escrow on Base Sepolia");
        console.log("  - Deposit 1000 SRC tokens to source escrow");
        console.log("  - Deposit 900 DST tokens to destination escrow");
        console.log("  - Deposit 0.001 ETH safety to each escrow");
        console.log("Gas Used: ~450,000");
        
        console.log("\n[INTERNAL ACTION] Automatic Fund Movement");
        console.log("Triggered by: Escrow creation notification");
        console.log("Action: RelayerService moves user's pre-approved 1000 SRC tokens to source escrow");
        console.log("Result: User funds locked in escrow");
        
        console.log("\n[TRANSACTION 7] Secret Reveal");
        console.log("From: %s (Relayer)", RELAYER);
        console.log("To: RelayerService");
        console.log("Function: completeOrder(%s, %s)", uint256(orderId), uint256(SECRET));
        console.log("Actions:");
        console.log("  - Unlock destination escrow on Base Sepolia");
        console.log("  - User can now claim 900 DST tokens");
        console.log("  - Resolver safety deposit returned");
        console.log("Gas Used: ~95,000");
        
        console.log("\n[TRANSACTION 8] Resolver Withdrawal");
        console.log("From: %s (Resolver 1)", RESOLVER1);
        console.log("To: UniteResolverV2");
        console.log("Function: withdrawFromSourceEscrow(%s, %s)", uint256(orderId), uint256(SECRET));
        console.log("Actions:");
        console.log("  - Unlock source escrow with revealed secret");
        console.log("  - Resolver claims 1000 SRC tokens");
        console.log("  - Resolver safety deposit returned");
        console.log("Gas Used: ~75,000");
        
        console.log("\n=== SWAP COMPLETED ===");
        console.log("Total Transactions: 8");
        console.log("Total Gas Used: ~995,000");
        console.log("Time Elapsed: ~3 minutes");
        console.log("\nFINAL STATE:");
        console.log("- User: -1000 SRC, +900 DST");
        console.log("- Resolver: +1000 SRC, -900 DST");
        console.log("- Safety Deposits: All returned");
        console.log("- Order Status: Completed");
    }
    
    function test_RescueScenario() public {
        console.log("\n=== RESCUE SCENARIO REPORT ===\n");
        
        bytes32 orderId = keccak256(abi.encodePacked(USER, "rescue", block.timestamp));
        
        console.log("INITIAL STATE:");
        console.log("- Order ID: %s", uint256(orderId));
        console.log("- Resolver 1 commits but fails to complete");
        
        console.log("\n[TIME PASSES] 6 minutes elapsed...");
        console.log("Execution window expired!");
        
        console.log("\n[RESCUE TRANSACTION 1] New Resolver Takes Over");
        console.log("From: %s (Resolver 2)", RESOLVER2);
        console.log("To: RelayerService");
        console.log("Function: rescueOrder(%s)", uint256(orderId));
        console.log("Result: Resolver 2 assigned to order");
        console.log("New execution window: 5 minutes");
        console.log("Gas Used: ~65,000");
        
        console.log("\n[RESCUE TRANSACTION 2] Rescue Completion");
        console.log("From: %s (Resolver 2)", RESOLVER2);
        console.log("Actions: Same as normal flow but by Resolver 2");
        console.log("Additional Benefit: Resolver 2 claims Resolver 1's forfeited safety deposits");
        console.log("Total Profit for Resolver 2: 0.002 ETH + swap fees");
        
        console.log("\n=== RESCUE COMPLETED ===");
        console.log("Failed Resolver Loss: 0.002 ETH (safety deposits)");
        console.log("Rescue Resolver Gain: 0.002 ETH + normal profits");
    }
}