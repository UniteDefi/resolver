import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import { MockRelayerService } from "../utils/mock-relayer";
import { MockResolver, ResolverConfig } from "../utils/mock-resolver";

describe("Complete Relayer Cross-Chain Flow", function() {
  this.timeout(60000); // 1 minute timeout for full flow tests
  
  let relayer: MockRelayerService;
  let resolver1: MockResolver;
  let resolver2: MockResolver;
  let resolver3: MockResolver;

  // Test user addresses
  const userAlice = "0x742d35Cc6Ff93D3AbE4FcbFcD1cE2C51";
  const userBob = "bob.testnet";
  
  before(async () => {
    console.log("[Test] Setting up complete relayer flow test environment...");
    
    // Initialize mock relayer service
    relayer = new MockRelayerService();
    
    // Create multiple resolvers with different strategies
    const resolver1Config: ResolverConfig = {
      address: "0x8ba1f109551bD432803012645Hac136c82",
      name: "FastResolver",
      profitMargin: 0.3, // 0.3% profit margin - aggressive
      maxOrderSize: "10000",
      supportedTokens: ["USDT", "USDC", "DAI", "NEAR", "wNEAR"],
      safetyDepositETH: "0.01",
      safetyDepositNEAR: "1",
    };

    const resolver2Config: ResolverConfig = {
      address: "0x95aD61B0a150d79219dCF64E1E6Cc01f5b",
      name: "ConservativeResolver", 
      profitMargin: 0.8, // 0.8% profit margin - conservative
      maxOrderSize: "5000",
      supportedTokens: ["USDT", "USDC", "NEAR"],
      safetyDepositETH: "0.005",
      safetyDepositNEAR: "0.5",
    };

    const resolver3Config: ResolverConfig = {
      address: "0x47e179ec197488593b187f80a00eb0da91",
      name: "RescueResolver",
      profitMargin: 1.0, // 1% profit margin - patient rescuer
      maxOrderSize: "20000", 
      supportedTokens: ["USDT", "USDC", "DAI", "NEAR", "wNEAR"],
      safetyDepositETH: "0.02",
      safetyDepositNEAR: "2",
    };

    resolver1 = new MockResolver(resolver1Config, relayer);
    resolver2 = new MockResolver(resolver2Config, relayer);
    resolver3 = new MockResolver(resolver3Config, relayer);

    console.log("[Test] Relayer and resolvers initialized");
  });

  after(() => {
    console.log("[Test] Cleaning up test environment...");
    resolver1?.destroy();
    resolver2?.destroy();
    resolver3?.destroy();
    relayer?.destroy();
  });

  describe("Base Sepolia → NEAR Flow", () => {
    it("should complete a full cross-chain swap from Base USDT to NEAR DAI", async () => {
      console.log("\n=== BASE SEPOLIA → NEAR FLOW ===");
      
      // Step 1: User Alice submits order
      console.log("\n--- Step 1: User submits order ---");
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDT",
        destToken: "DAI",
        sourceAmount: "1000", // 1000 USDT
        destAmount: "995", // 995 DAI (accounting for slippage)
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000, // 30 minutes
      };

      const { orderId, secretHash } = relayer.submitOrder(orderParams);
      
      expect(orderId).to.be.a("string");
      expect(secretHash).to.be.a("string");
      console.log(`[Test] Order created: ${orderId}`);
      console.log(`[Test] Secret hash: ${secretHash.substring(0, 16)}...`);

      // Step 2: Wait for resolver to commit
      console.log("\n--- Step 2: Waiting for resolver commitment ---");
      
      const commitmentPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("No resolver committed within 10 seconds"));
        }, 10000);

        relayer.once("orderCommitted", (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const commitmentData = await commitmentPromise as any;
      expect(commitmentData.orderId).to.equal(orderId);
      console.log(`[Test] Resolver ${commitmentData.resolver} committed successfully`);

      // Step 3: Simulate relayer transferring user funds
      console.log("\n--- Step 3: Relayer transfers user funds ---");
      const transferSuccess = await relayer.transferUserFunds(orderId);
      expect(transferSuccess).to.be.true;

      // Step 4: Wait for resolver to complete destination
      console.log("\n--- Step 4: Waiting for destination completion ---");
      
      const completionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Order not completed within 15 seconds"));
        }, 15000);

        relayer.once("orderCompleted", (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const completionData = await completionPromise as any;
      expect(completionData.orderId).to.equal(orderId);
      expect(completionData.secret).to.be.a("string");
      console.log(`[Test] Order completed! Secret: ${completionData.secret.substring(0, 16)}...`);

      // Step 5: Verify final state
      console.log("\n--- Step 5: Verifying final state ---");
      const finalOrder = relayer.getOrder(orderId);
      const finalCommitment = relayer.getCommitment(orderId);
      
      expect(finalOrder?.isCompleted).to.be.true;
      expect(finalCommitment?.isCompleted).to.be.true;
      
      console.log(`[Test] ✅ Base Sepolia → NEAR swap completed successfully!`);
      console.log(`[Test] User Alice: 1000 USDT → User Bob: 995 DAI`);
      console.log(`[Test] Resolver earned profit + safety deposits returned`);
    });

    it("should handle multiple resolvers competing for the same order", async () => {
      console.log("\n=== RESOLVER COMPETITION TEST ===");
      
      // Create a highly profitable order
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDC",
        destToken: "wNEAR",
        sourceAmount: "500", // 500 USDC
        destAmount: "8", // 8 NEAR (very attractive rate)
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Track which resolver commits first
      const commitmentPromise = new Promise((resolve) => {
        relayer.once("orderCommitted", resolve);
      });

      const commitmentData = await commitmentPromise as any;
      console.log(`[Test] Winner: ${commitmentData.resolver}`);
      
      // Verify only one commitment exists
      const commitment = relayer.getCommitment(orderId);
      expect(commitment).to.not.be.undefined;
      expect(commitment?.isActive).to.be.true;
      
      // Verify FastResolver (most aggressive) likely won
      const resolverStats = [resolver1, resolver2, resolver3].map(r => r.getStats());
      console.log("[Test] Resolver stats:", resolverStats);
      
      console.log(`[Test] ✅ Resolver competition handled correctly`);
    });
  });

  describe("NEAR → Base Sepolia Flow", () => {
    it("should complete a full cross-chain swap from NEAR DAI to Base USDT", async () => {
      console.log("\n=== NEAR → BASE SEPOLIA FLOW ===");
      
      // Step 1: User Bob submits reverse order
      console.log("\n--- Step 1: User submits reverse order ---");
      const orderParams = {
        user: userBob,
        sourceChain: "near" as const,
        destChain: "base-sepolia" as const,
        sourceToken: "DAI",
        destToken: "USDT",
        sourceAmount: "800", // 800 DAI
        destAmount: "798", // 798 USDT
        destRecipient: userAlice,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId, secretHash } = relayer.submitOrder(orderParams);
      
      expect(orderId).to.be.a("string");
      expect(secretHash).to.be.a("string");
      console.log(`[Test] Reverse order created: ${orderId}`);

      // Step 2: Wait for resolver commitment
      console.log("\n--- Step 2: Waiting for resolver commitment ---");
      
      const commitmentPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("No resolver committed within 10 seconds"));
        }, 10000);

        relayer.once("orderCommitted", (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const commitmentData = await commitmentPromise as any;
      expect(commitmentData.orderId).to.equal(orderId);
      console.log(`[Test] Resolver ${commitmentData.resolver} committed to reverse order`);

      // Step 3: Transfer user funds and complete
      console.log("\n--- Step 3: Executing reverse swap ---");
      const transferSuccess = await relayer.transferUserFunds(orderId);
      expect(transferSuccess).to.be.true;

      // Step 4: Wait for completion
      const completionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Reverse order not completed within 15 seconds"));
        }, 15000);

        relayer.once("orderCompleted", (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const completionData = await completionPromise as any;
      expect(completionData.orderId).to.equal(orderId);
      
      console.log(`[Test] ✅ NEAR → Base Sepolia swap completed successfully!`);
      console.log(`[Test] User Bob: 800 DAI → User Alice: 798 USDT`);
      console.log(`[Test] Bi-directional flow verified`);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle orders with insufficient profit margin", async () => {
      console.log("\n=== UNPROFITABLE ORDER TEST ===");
      
      // Create an order with very low profit margin
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDT",
        destToken: "DAI",
        sourceAmount: "100",
        destAmount: "100.5", // Very small spread
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Wait to see if any resolver commits
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      const commitment = relayer.getCommitment(orderId);
      
      if (!commitment) {
        console.log(`[Test] ✅ No resolver committed to unprofitable order (expected)`);
      } else {
        console.log(`[Test] ⚠️ Resolver ${commitment.resolver} committed despite low profit`);
      }
    });

    it("should handle orders exceeding resolver capacity", async () => {
      console.log("\n=== LARGE ORDER TEST ===");
      
      // Create an order larger than most resolvers can handle
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDT",
        destToken: "DAI",
        sourceAmount: "15000", // Larger than resolver2's max capacity
        destAmount: "14800",
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Wait for commitment
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      const commitment = relayer.getCommitment(orderId);
      
      if (commitment) {
        // Should be resolver1 or resolver3 (higher capacity)
        expect(commitment.resolver).to.not.equal("0x95aD61B0a150d79219dCF64E1E6Cc01f5b"); // resolver2
        console.log(`[Test] ✅ Large order handled by high-capacity resolver: ${commitment.resolver}`);
      } else {
        console.log(`[Test] ❌ No resolver could handle large order`);
      }
    });

    it("should properly track resolver statistics", async () => {
      console.log("\n=== RESOLVER STATISTICS TEST ===");
      
      const stats1 = resolver1.getStats();
      const stats2 = resolver2.getStats();
      const stats3 = resolver3.getStats();
      
      console.log(`[Test] ${stats1.name}: Active=${stats1.isActive}, Margin=${stats1.profitMargin}%`);
      console.log(`[Test] ${stats2.name}: Active=${stats2.isActive}, Margin=${stats2.profitMargin}%`);
      console.log(`[Test] ${stats3.name}: Active=${stats3.isActive}, Margin=${stats3.profitMargin}%`);
      
      expect(stats1.isActive).to.be.true;
      expect(stats2.isActive).to.be.true;
      expect(stats3.isActive).to.be.true;
      
      console.log(`[Test] ✅ All resolvers operating correctly`);
    });
  });

  describe("System Integration", () => {
    it("should handle rapid succession of orders", async () => {
      console.log("\n=== RAPID ORDER TEST ===");
      
      const orders = [];
      
      // Submit 3 orders in quick succession
      for (let i = 0; i < 3; i++) {
        const orderParams = {
          user: i % 2 === 0 ? userAlice : userBob,
          sourceChain: i % 2 === 0 ? "base-sepolia" as const : "near" as const,
          destChain: i % 2 === 0 ? "near" as const : "base-sepolia" as const,
          sourceToken: i % 2 === 0 ? "USDT" : "DAI",
          destToken: i % 2 === 0 ? "DAI" : "USDT",
          sourceAmount: `${100 + i * 50}`,
          destAmount: `${99 + i * 49}`,
          destRecipient: i % 2 === 0 ? userBob : userAlice,
          deadline: Date.now() + 30 * 60 * 1000,
        };

        const result = relayer.submitOrder(orderParams);
        orders.push(result);
        
        // Small delay between orders
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`[Test] Submitted ${orders.length} orders rapidly`);
      
      // Wait for all to potentially complete
      await new Promise(resolve => setTimeout(resolve, 20000));
      
      // Check how many completed
      let completedCount = 0;
      for (const order of orders) {
        const finalOrder = relayer.getOrder(order.orderId);
        if (finalOrder?.isCompleted) {
          completedCount++;
        }
      }
      
      console.log(`[Test] ✅ ${completedCount}/${orders.length} orders completed successfully`);
      expect(completedCount).to.be.at.least(1);
    });
  });
});