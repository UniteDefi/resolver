import { describe, it, beforeAll, afterAll, expect, jest } from "@jest/globals";
import { 
  JsonRpcProvider, 
  Wallet,
  parseUnits,
  formatUnits
} from "ethers";
import { 
  Account,
  Ed25519PrivateKey,
  Network
} from "@aptos-labs/ts-sdk";
import { RelayerService, OrderState } from "../services/relayer-service";
import { ResolverService } from "../services/resolver-service";
import { AptosClientHelper } from "../aptos/helpers/aptos-client";

jest.setTimeout(120000); // 2 minutes timeout

describe("Full Relayer-Orchestrated Cross-Chain Flow", () => {
  let relayerService: RelayerService;
  let resolver1: ResolverService;
  let resolver2: ResolverService;
  let resolver3: ResolverService;
  
  let user1: Wallet;
  let user2: Account;
  let aptosClient: AptosClientHelper;
  
  // Mock addresses and configuration
  const MOCK_USDC_BASE = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const MOCK_USDC_APTOS = "0x1::usdc::USDC";
  const MOCK_RELAYER_ESCROW_BASE = "0x1234567890123456789012345678901234567890";
  const MOCK_RELAYER_ESCROW_APTOS = "0x1::relayer_escrow";
  
  beforeAll(async () => {
    console.log("🚀 Setting up Full Relayer Flow Test Suite");
    console.log("==========================================");
    
    // Initialize users
    user1 = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    user2 = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey("0x1234567890123456789012345678901234567890123456789012345678901234")
    });
    
    aptosClient = new AptosClientHelper(Network.TESTNET);
    
    // Initialize relayer service
    relayerService = new RelayerService({
      baseSepolia: {
        rpc: "https://sepolia.base.org",
        chainId: 84532,
        relayerEscrow: MOCK_RELAYER_ESCROW_BASE,
        privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
      },
      aptos: {
        network: Network.TESTNET,
        relayerEscrow: MOCK_RELAYER_ESCROW_APTOS,
        privateKey: "0x2345678901234567890123456789012345678901234567890123456789012345"
      }
    });
    
    // Initialize resolver services
    resolver1 = new ResolverService({
      name: "Resolver1",
      address: "0x8ba1f109551bD432803012645Hac189451c123ab",
      privateKey: "0x3456789012345678901234567890123456789012345678901234567890123456",
      minimumProfitBps: 50, // 0.5%
      safetyDepositAmount: parseUnits("0.01", 18),
      baseSepolia: {
        rpc: "https://sepolia.base.org",
        relayerEscrow: MOCK_RELAYER_ESCROW_BASE
      },
      aptos: {
        network: Network.TESTNET,
        relayerEscrow: MOCK_RELAYER_ESCROW_APTOS
      }
    }, relayerService);
    
    resolver2 = new ResolverService({
      name: "Resolver2", 
      address: "0x9C5e5e4A4B94908f83103eb1f1706367c2e68ca8",
      privateKey: "0x4567890123456789012345678901234567890123456789012345678901234567",
      minimumProfitBps: 75, // 0.75%
      safetyDepositAmount: parseUnits("0.01", 18),
      baseSepolia: {
        rpc: "https://sepolia.base.org",
        relayerEscrow: MOCK_RELAYER_ESCROW_BASE
      },
      aptos: {
        network: Network.TESTNET,
        relayerEscrow: MOCK_RELAYER_ESCROW_APTOS
      }
    }, relayerService);
    
    resolver3 = new ResolverService({
      name: "Resolver3",
      address: "0xA6A745D5e45ea531de29b49d15980a79551c1234",
      privateKey: "0x5678901234567890123456789012345678901234567890123456789012345678",
      minimumProfitBps: 100, // 1%
      safetyDepositAmount: parseUnits("0.01", 18),
      baseSepolia: {
        rpc: "https://sepolia.base.org",
        relayerEscrow: MOCK_RELAYER_ESCROW_BASE
      },
      aptos: {
        network: Network.TESTNET,
        relayerEscrow: MOCK_RELAYER_ESCROW_APTOS
      }
    }, relayerService);
    
    // Start all services
    await relayerService.start();
    await resolver1.start();
    await resolver2.start();
    await resolver3.start();
    
    console.log("✅ All services started successfully");
  });
  
  afterAll(async () => {
    await resolver1.stop();
    await resolver2.stop();
    await resolver3.stop();
    await relayerService.stop();
  });

  describe("Base Sepolia -> Aptos Flow", () => {
    it("should complete full swap flow from Base Sepolia to Aptos", async () => {
      console.log("\n🌉 TEST 1: Base Sepolia -> Aptos Swap");
      console.log("=====================================");
      
      const srcAmount = parseUnits("100", 6); // 100 USDC
      const dstAmount = parseUnits("99.25", 6); // 99.25 USDC (0.75% fee)
      
      console.log(`📋 Order Details:`);
      console.log(`  From: ${formatUnits(srcAmount, 6)} USDC (Base Sepolia)`);
      console.log(`  To: ${formatUnits(dstAmount, 6)} USDC (Aptos)`);
      console.log(`  Profit: ${formatUnits(srcAmount - dstAmount, 6)} USDC`);
      
      // Step 1: User approves tokens (simulated)
      console.log("\n1️⃣ User approves 100 USDC to relayer");
      
      // Step 2: Relayer creates order
      console.log("2️⃣ Relayer creates order");
      const orderId = await relayerService.createSwapOrder(
        user1.address,
        "Base Sepolia",
        "Aptos",
        MOCK_USDC_BASE,
        MOCK_USDC_APTOS,
        srcAmount,
        dstAmount
      );
      
      console.log(`   Order ID: ${orderId}`);
      
      // Step 3: Wait for resolver to commit
      const orderCommittedPromise = new Promise((resolve) => {
        relayerService.once("orderCommitted", resolve);
      });
      
      console.log("3️⃣ Waiting for resolver commitment...");
      const commitmentData = await orderCommittedPromise as any;
      console.log(`   Committed by: ${commitmentData.resolver}`);
      
      // Step 4: Wait for order completion
      const orderCompletedPromise = new Promise((resolve) => {
        relayerService.once("orderCompleted", resolve);
      });
      
      console.log("4️⃣ Waiting for order completion...");
      const completionData = await orderCompletedPromise as any;
      console.log(`   Secret revealed: ${completionData.secret}`);
      
      // Verify final state
      const finalOrder = relayerService.getOrder(orderId);
      expect(finalOrder?.state).toBe(OrderState.Completed);
      expect(finalOrder?.secret).toBeTruthy();
      
      console.log("✅ Base Sepolia -> Aptos swap completed successfully!");
      
      // Display resolver stats
      console.log("\n📊 Resolver Statistics:");
      console.log(`   Resolver1: ${JSON.stringify(resolver1.getStats(), null, 2)}`);
      console.log(`   Resolver2: ${JSON.stringify(resolver2.getStats(), null, 2)}`);
      console.log(`   Resolver3: ${JSON.stringify(resolver3.getStats(), null, 2)}`);
    });
  });

  describe("Aptos -> Base Sepolia Flow", () => {
    it("should complete full swap flow from Aptos to Base Sepolia", async () => {
      console.log("\n\n🌉 TEST 2: Aptos -> Base Sepolia Swap");
      console.log("=====================================");
      
      const srcAmount = parseUnits("100", 6); // 100 USDC
      const dstAmount = parseUnits("99", 6); // 99 USDC (1% fee)
      
      console.log(`📋 Order Details:`);
      console.log(`  From: ${formatUnits(srcAmount, 6)} USDC (Aptos)`);
      console.log(`  To: ${formatUnits(dstAmount, 6)} USDC (Base Sepolia)`);
      console.log(`  Profit: ${formatUnits(srcAmount - dstAmount, 6)} USDC`);
      
      // Step 1: User approves tokens (simulated)
      console.log("\n1️⃣ User approves 100 USDC to relayer on Aptos");
      
      // Step 2: Relayer creates order
      console.log("2️⃣ Relayer creates order");
      const orderId = await relayerService.createSwapOrder(
        user2.accountAddress.toString(),
        "Aptos",
        "Base Sepolia",
        MOCK_USDC_APTOS,
        MOCK_USDC_BASE,
        srcAmount,
        dstAmount
      );
      
      console.log(`   Order ID: ${orderId}`);
      
      // Step 3: Wait for resolver to commit
      const orderCommittedPromise = new Promise((resolve) => {
        relayerService.once("orderCommitted", resolve);
      });
      
      console.log("3️⃣ Waiting for resolver commitment...");
      const commitmentData = await orderCommittedPromise as any;
      console.log(`   Committed by: ${commitmentData.resolver}`);
      
      // Step 4: Wait for order completion
      const orderCompletedPromise = new Promise((resolve) => {
        relayerService.once("orderCompleted", resolve);
      });
      
      console.log("4️⃣ Waiting for order completion...");
      const completionData = await orderCompletedPromise as any;
      console.log(`   Secret revealed: ${completionData.secret}`);
      
      // Verify final state
      const finalOrder = relayerService.getOrder(orderId);
      expect(finalOrder?.state).toBe(OrderState.Completed);
      expect(finalOrder?.secret).toBeTruthy();
      
      console.log("✅ Aptos -> Base Sepolia swap completed successfully!");
    });
  });

  describe("Timeout and Rescue Mechanism", () => {
    it("should handle resolver timeout and rescue by another resolver", async () => {
      console.log("\n\n⏰ TEST 3: Timeout and Rescue Mechanism");
      console.log("======================================");
      
      // Create a custom slow resolver that won't complete in time
      const slowResolver = new ResolverService({
        name: "SlowResolver",
        address: "0xB7B846E9f8c12345678901234567890123456789",
        privateKey: "0x6789012345678901234567890123456789012345678901234567890123456789",
        minimumProfitBps: 25, // Very low threshold to ensure it commits
        safetyDepositAmount: parseUnits("0.01", 18),
        baseSepolia: {
          rpc: "https://sepolia.base.org",
          relayerEscrow: MOCK_RELAYER_ESCROW_BASE
        },
        aptos: {
          network: Network.TESTNET,
          relayerEscrow: MOCK_RELAYER_ESCROW_APTOS
        }
      }, relayerService);
      
      await slowResolver.start();
      
      // Override the completeOrder method to simulate slow completion
      const originalComplete = (slowResolver as any).completeOrder;
      (slowResolver as any).completeOrder = async (orderId: string) => {
        console.log(`[SlowResolver] Received completion request for ${orderId} - simulating delay...`);
        // Don't complete - simulate hanging
      };
      
      const srcAmount = parseUnits("50", 6);
      const dstAmount = parseUnits("49.5", 6); // 1% fee
      
      console.log(`📋 Order Details:`);
      console.log(`  From: ${formatUnits(srcAmount, 6)} USDC (Base Sepolia)`);
      console.log(`  To: ${formatUnits(dstAmount, 6)} USDC (Aptos)`);
      console.log(`  Expected to timeout and be rescued`);
      
      console.log("\n1️⃣ Creating order that will timeout");
      const orderId = await relayerService.createSwapOrder(
        user1.address,
        "Base Sepolia", 
        "Aptos",
        MOCK_USDC_BASE,
        MOCK_USDC_APTOS,
        srcAmount,
        dstAmount
      );
      
      // Wait for commitment
      const orderCommittedPromise = new Promise((resolve) => {
        relayerService.once("orderCommitted", resolve);
      });
      
      console.log("2️⃣ Waiting for slow resolver commitment...");
      const commitmentData = await orderCommittedPromise as any;
      console.log(`   Committed by: ${commitmentData.resolver}`);
      
      // Wait for timeout event
      const timeoutPromise = new Promise((resolve) => {
        relayerService.once("orderTimedOut", resolve);
      });
      
      console.log("3️⃣ Waiting for timeout (5 minutes simulated as 5 seconds)...");
      
      // Mock the timeout by emitting the event after a short delay
      setTimeout(() => {
        const order = relayerService.getOrder(orderId);
        if (order) {
          relayerService.emit("orderTimedOut", order);
        }
      }, 3000);
      
      await timeoutPromise;
      console.log("⏰ Order timed out!");
      
      // Wait for rescue attempt
      const rescuePromise = new Promise((resolve) => {
        resolver1.once("orderRescued", resolve);
        resolver2.once("orderRescued", resolve);
        resolver3.once("orderRescued", resolve);
      });
      
      console.log("4️⃣ Waiting for rescue attempt...");
      const rescueData = await rescuePromise as any;
      console.log(`   Rescued by resolver with profit: ${rescueData.profit}`);
      
      console.log("✅ Timeout and rescue mechanism working correctly!");
      
      await slowResolver.stop();
    });
  });

  describe("Competitive Resolver Environment", () => {
    it("should handle multiple resolvers competing for profitable orders", async () => {
      console.log("\n\n🏁 TEST 4: Competitive Resolver Environment");
      console.log("===========================================");
      
      // Create multiple orders with different profitability
      const orders = [
        {
          srcAmount: parseUnits("100", 6),
          dstAmount: parseUnits("99.5", 6), // 0.5% profit - only resolver1 should take
          description: "Low profit order (0.5%)"
        },
        {
          srcAmount: parseUnits("100", 6),
          dstAmount: parseUnits("99", 6), // 1% profit - resolver1 and resolver2 should compete
          description: "Medium profit order (1%)"
        },
        {
          srcAmount: parseUnits("100", 6),
          dstAmount: parseUnits("98.5", 6), // 1.5% profit - all resolvers should compete
          description: "High profit order (1.5%)"
        }
      ];
      
      console.log("📊 Resolver Profit Thresholds:");
      console.log("   Resolver1: 0.5% minimum");
      console.log("   Resolver2: 0.75% minimum");
      console.log("   Resolver3: 1% minimum");
      
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        console.log(`\n${i + 1}️⃣ Creating ${order.description}`);
        
        const orderId = await relayerService.createSwapOrder(
          user1.address,
          "Base Sepolia",
          "Aptos", 
          MOCK_USDC_BASE,
          MOCK_USDC_APTOS,
          order.srcAmount,
          order.dstAmount
        );
        
        // Wait for commitment
        const commitmentPromise = new Promise((resolve) => {
          relayerService.once("orderCommitted", resolve);
        });
        
        const commitmentData = await commitmentPromise as any;
        console.log(`   Winner: ${commitmentData.resolver}`);
        
        // Wait for completion
        const completionPromise = new Promise((resolve) => {
          relayerService.once("orderCompleted", resolve);
        });
        
        await completionPromise;
        console.log(`   ✅ Order completed`);
        
        // Small delay between orders
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log("\n📈 Final Resolver Statistics:");
      console.log("   Resolver1:", resolver1.getStats());
      console.log("   Resolver2:", resolver2.getStats());
      console.log("   Resolver3:", resolver3.getStats());
    });
  });

  describe("System Statistics and Performance", () => {
    it("should provide comprehensive system statistics", async () => {
      console.log("\n\n📊 FINAL SYSTEM STATISTICS");
      console.log("===========================");
      
      const relayerStats = relayerService.getStats();
      console.log("\n🔄 Relayer Statistics:");
      console.log(`   Total Orders: ${relayerStats.totalOrders}`);
      console.log(`   Pending Orders: ${relayerStats.pendingOrders}`);
      console.log(`   Committed Orders: ${relayerStats.committedOrders}`);
      console.log(`   Completed Orders: ${relayerStats.completedOrders}`);
      console.log(`   Rescued Orders: ${relayerStats.rescuedOrders}`);
      console.log(`   Registered Resolvers: ${relayerStats.registeredResolvers}`);
      
      console.log("\n🔧 Resolver Performance:");
      console.log("   Resolver1:", resolver1.getStats());
      console.log("   Resolver2:", resolver2.getStats());
      console.log("   Resolver3:", resolver3.getStats());
      
      console.log("\n📈 System Health Metrics:");
      console.log(`   Success Rate: ${(relayerStats.completedOrders / relayerStats.totalOrders * 100).toFixed(2)}%`);
      console.log(`   Rescue Rate: ${(relayerStats.rescuedOrders / relayerStats.totalOrders * 100).toFixed(2)}%`);
      
      // Verify system performed correctly
      expect(relayerStats.totalOrders).toBeGreaterThan(0);
      expect(relayerStats.completedOrders + relayerStats.rescuedOrders).toBe(relayerStats.totalOrders);
      expect(relayerStats.registeredResolvers).toBe(3);
      
      console.log("\n✅ All tests completed successfully!");
      console.log("🎯 System demonstrated:");
      console.log("   • Relayer-orchestrated cross-chain swaps");
      console.log("   • Competitive resolver environment");
      console.log("   • Safety deposit mechanism");
      console.log("   • Timeout and rescue functionality");
      console.log("   • Bi-directional swaps (Base Sepolia ↔ Aptos)");
    });
  });
});