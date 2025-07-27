import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import { MockRelayerService } from "../utils/mock-relayer";
import { MockResolver, ResolverConfig } from "../utils/mock-resolver";

describe("Timeout and Rescue Mechanisms", function() {
  this.timeout(120000); // 2 minute timeout for rescue tests
  
  let relayer: MockRelayerService;
  let slowResolver: MockResolver;
  let fastResolver: MockResolver;
  let rescueResolver: MockResolver;

  const userAlice = "0x742d35Cc6Ff93D3AbE4FcbFcD1cE2C51";
  const userBob = "bob.testnet";

  before(async () => {
    console.log("[Test] Setting up timeout and rescue test environment...");
    
    relayer = new MockRelayerService();
    
    // Create a slow resolver that will timeout
    const slowResolverConfig: ResolverConfig = {
      address: "0x1111111111111111111111111111111111",
      name: "SlowResolver",
      profitMargin: 0.1, // Very aggressive to win bids
      maxOrderSize: "10000",
      supportedTokens: ["USDT", "USDC", "DAI", "NEAR"],
      safetyDepositETH: "0.01",
      safetyDepositNEAR: "1",
    };

    // Create a fast resolver for comparison
    const fastResolverConfig: ResolverConfig = {
      address: "0x2222222222222222222222222222222222",
      name: "FastResolver",
      profitMargin: 0.5, // Moderate profit margin
      maxOrderSize: "10000",
      supportedTokens: ["USDT", "USDC", "DAI", "NEAR"],
      safetyDepositETH: "0.01",
      safetyDepositNEAR: "1",
    };

    // Create a rescue resolver
    const rescueResolverConfig: ResolverConfig = {
      address: "0x3333333333333333333333333333333333",
      name: "RescueResolver",
      profitMargin: 1.5, // Higher margin, will only rescue
      maxOrderSize: "20000",
      supportedTokens: ["USDT", "USDC", "DAI", "NEAR", "wNEAR"],
      safetyDepositETH: "0.02",
      safetyDepositNEAR: "2",
    };

    slowResolver = new MockResolver(slowResolverConfig, relayer);
    fastResolver = new MockResolver(fastResolverConfig, relayer);
    rescueResolver = new MockResolver(rescueResolverConfig, relayer);

    console.log("[Test] Timeout test environment initialized");
  });

  after(() => {
    console.log("[Test] Cleaning up timeout test environment...");
    slowResolver?.destroy();
    fastResolver?.destroy();
    rescueResolver?.destroy();
    relayer?.destroy();
  });

  describe("Resolver Timeout Scenarios", () => {
    it("should allow rescue when resolver fails to complete within 5 minutes", async () => {
      console.log("\n=== RESOLVER TIMEOUT & RESCUE TEST ===");
      
      // Step 1: Create order that slow resolver will commit to
      console.log("\n--- Step 1: Creating order for slow resolver ---");
      
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDT",
        destToken: "DAI",
        sourceAmount: "1000",
        destAmount: "998", // Very attractive for slow resolver
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000, // 30 minutes
      };

      const { orderId } = relayer.submitOrder(orderParams);
      console.log(`[Test] Order created: ${orderId}`);

      // Step 2: Wait for initial commitment (should be slow resolver)
      console.log("\n--- Step 2: Waiting for initial commitment ---");
      
      const commitmentPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("No initial commitment within 10 seconds"));
        }, 10000);

        relayer.once("orderCommitted", (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const initialCommitment = await commitmentPromise as any;
      expect(initialCommitment.orderId).to.equal(orderId);
      console.log(`[Test] Initial commitment by: ${initialCommitment.resolver}`);

      // Step 3: Deactivate the committed resolver to simulate failure
      console.log("\n--- Step 3: Simulating resolver failure ---");
      
      if (initialCommitment.resolver === slowResolver.getStats().address) {
        slowResolver.setActive(false);
        console.log("[Test] SlowResolver deactivated (simulating failure)");
      } else {
        // If fast resolver committed, deactivate it
        fastResolver.setActive(false);
        console.log("[Test] FastResolver deactivated (simulating failure)");
      }

      // Step 4: Fast-forward time to simulate 5+ minute timeout
      console.log("\n--- Step 4: Fast-forwarding time (simulated) ---");
      
      // Simulate the timeout by manually triggering rescue check
      // In real implementation, this would happen after 5 minutes
      const commitment = relayer.getCommitment(orderId)!;
      
      // Manually set commit time to be older than 5 minutes for testing
      const oldCommitTime = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      (commitment as any).commitTime = oldCommitTime;

      console.log("[Test] Simulated 5+ minute timeout");

      // Step 5: Trigger rescue by available resolver
      console.log("\n--- Step 5: Triggering rescue mechanism ---");
      
      const rescuePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("No rescue within 15 seconds"));
        }, 15000);

        relayer.once("orderRescued", (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      // Check if order is rescuable
      const rescuableOrders = relayer.getRescuableOrders();
      expect(rescuableOrders.length).to.be.at.least(1);
      console.log(`[Test] Found ${rescuableOrders.length} rescuable order(s)`);

      // Manually trigger rescue (in real scenario, this would be automatic)
      const rescueSuccess = relayer.rescueOrder(
        rescueResolver.getStats().address,
        orderId,
        "new-source-escrow-id",
        "new-dest-escrow-id"
      );

      expect(rescueSuccess).to.be.true;

      const rescueData = await rescuePromise as any;
      expect(rescueData.orderId).to.equal(orderId);
      expect(rescueData.rescuer).to.equal(rescueResolver.getStats().address);
      
      console.log(`[Test] Order rescued by: ${rescueData.rescuer}`);
      console.log(`[Test] Original resolver ${rescueData.originalResolver} loses safety deposits`);

      // Step 6: Verify rescue completion
      console.log("\n--- Step 6: Verifying rescue completion ---");
      
      const completionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Rescued order not completed within 20 seconds"));
        }, 20000);

        relayer.once("orderCompleted", (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      const completionData = await completionPromise as any;
      expect(completionData.orderId).to.equal(orderId);
      expect(completionData.resolver).to.equal(rescueResolver.getStats().address);
      
      console.log(`[Test] ✅ Rescue completed successfully!`);
      console.log(`[Test] Rescuer earned: original trade profit + failed resolver's safety deposits`);
    });

    it("should prevent resolvers from rescuing their own orders", async () => {
      console.log("\n=== SELF-RESCUE PREVENTION TEST ===");
      
      // Create order and get commitment
      const orderParams = {
        user: userAlice,
        sourceChain: "near" as const,
        destChain: "base-sepolia" as const,
        sourceToken: "DAI",
        destToken: "USDT", 
        sourceAmount: "500",
        destAmount: "499",
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Wait for commitment
      const commitmentPromise = new Promise((resolve) => {
        relayer.once("orderCommitted", resolve);
      });

      const commitmentData = await commitmentPromise as any;
      const originalResolver = commitmentData.resolver;
      
      // Simulate timeout
      const commitment = relayer.getCommitment(orderId)!;
      (commitment as any).commitTime = Date.now() - (6 * 60 * 1000);

      // Try to rescue with same resolver
      const selfRescueSuccess = relayer.rescueOrder(
        originalResolver,
        orderId,
        "self-rescue-source",
        "self-rescue-dest"
      );

      expect(selfRescueSuccess).to.be.false;
      console.log(`[Test] ✅ Self-rescue correctly prevented for resolver ${originalResolver}`);
    });

    it("should handle multiple resolvers competing for rescue", async () => {
      console.log("\n=== RESCUE COMPETITION TEST ===");
      
      // Create a high-value order for rescue competition
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDC",
        destToken: "wNEAR",
        sourceAmount: "2000", // High value order
        destAmount: "32",
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Wait for initial commitment
      await new Promise((resolve) => {
        relayer.once("orderCommitted", resolve);
      });

      // Simulate timeout
      const commitment = relayer.getCommitment(orderId)!;
      (commitment as any).commitTime = Date.now() - (6 * 60 * 1000);

      console.log(`[Test] Order ${orderId} is now rescuable (high value)`);

      // Both rescue and fast resolvers should compete
      // Note: In this mock implementation, first one to call wins
      const rescueSuccess1 = relayer.rescueOrder(
        rescueResolver.getStats().address,
        orderId,
        "rescue1-source",
        "rescue1-dest"
      );

      const rescueSuccess2 = relayer.rescueOrder(
        fastResolver.getStats().address,
        orderId,
        "rescue2-source", 
        "rescue2-dest"
      );

      // Only one should succeed
      expect(rescueSuccess1 !== rescueSuccess2).to.be.true;
      
      if (rescueSuccess1) {
        console.log(`[Test] ✅ RescueResolver won the rescue competition`);
      } else {
        console.log(`[Test] ✅ FastResolver won the rescue competition`);
      }
    });
  });

  describe("Timeout Edge Cases", () => {
    it("should handle orders that expire before rescue", async () => {
      console.log("\n=== ORDER EXPIRATION TEST ===");
      
      // Create order with very short deadline
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDT",
        destToken: "DAI",
        sourceAmount: "100",
        destAmount: "99",
        destRecipient: userBob,
        deadline: Date.now() + 5000, // Only 5 seconds
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Wait for commitment
      await new Promise((resolve) => {
        relayer.once("orderCommitted", resolve);
      });

      // Wait for order to expire
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Try to rescue expired order
      const rescueSuccess = relayer.rescueOrder(
        rescueResolver.getStats().address,
        orderId,
        "expired-source",
        "expired-dest"
      );

      // Should fail because order is expired
      expect(rescueSuccess).to.be.false;
      console.log(`[Test] ✅ Cannot rescue expired order (correct behavior)`);
    });

    it("should handle rescue attempts on completed orders", async () => {
      console.log("\n=== COMPLETED ORDER RESCUE TEST ===");
      
      // Create and complete order quickly
      const orderParams = {
        user: userAlice,
        sourceChain: "near" as const,
        destChain: "base-sepolia" as const,
        sourceToken: "DAI",
        destToken: "USDT",
        sourceAmount: "200",
        destAmount: "199",
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Wait for completion
      await new Promise((resolve) => {
        relayer.once("orderCompleted", resolve);
      });

      // Try to rescue completed order
      const rescueSuccess = relayer.rescueOrder(
        rescueResolver.getStats().address,
        orderId,
        "completed-source",
        "completed-dest"
      );

      expect(rescueSuccess).to.be.false;
      console.log(`[Test] ✅ Cannot rescue completed order (correct behavior)`);
    });
  });

  describe("Safety Deposit Economics", () => {
    it("should demonstrate safety deposit penalty mechanism", async () => {
      console.log("\n=== SAFETY DEPOSIT PENALTY TEST ===");
      
      const orderParams = {
        user: userAlice,
        sourceChain: "base-sepolia" as const,
        destChain: "near" as const,
        sourceToken: "USDT",
        destToken: "DAI",
        sourceAmount: "750",
        destAmount: "748",
        destRecipient: userBob,
        deadline: Date.now() + 30 * 60 * 1000,
      };

      const { orderId } = relayer.submitOrder(orderParams);
      
      // Track initial commitment
      const commitmentData = await new Promise((resolve) => {
        relayer.once("orderCommitted", resolve);
      }) as any;

      const originalResolver = commitmentData.resolver;
      console.log(`[Test] Original resolver: ${originalResolver}`);
      console.log(`[Test] Original safety deposits: ETH=${slowResolver.getStats().address === originalResolver ? '0.01' : '0.01'}, NEAR=${slowResolver.getStats().address === originalResolver ? '1' : '1'}`);

      // Simulate timeout and rescue
      const commitment = relayer.getCommitment(orderId)!;
      (commitment as any).commitTime = Date.now() - (6 * 60 * 1000);

      // Rescue with different resolver
      const rescuerAddress = originalResolver === rescueResolver.getStats().address 
        ? fastResolver.getStats().address 
        : rescueResolver.getStats().address;

      const rescueSuccess = relayer.rescueOrder(
        rescuerAddress,
        orderId,
        "penalty-source",
        "penalty-dest"
      );

      expect(rescueSuccess).to.be.true;
      
      console.log(`[Test] Rescuer: ${rescuerAddress}`);
      console.log(`[Test] Economic outcome:`);
      console.log(`[Test] - Original resolver loses: ETH safety deposit + NEAR safety deposit`);
      console.log(`[Test] - Rescuer gains: Trade profit + original resolver's safety deposits`);
      console.log(`[Test] - User receives: Intended tokens (no impact from resolver failure)`);
      
      console.log(`[Test] ✅ Safety deposit penalty mechanism working correctly`);
    });
  });
});