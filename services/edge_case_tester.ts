import { ethers } from "ethers";
import { SellerService, TestScenario } from "./seller/seller_service";
import { FastResolver } from "./resolvers/fast_resolver";
import { Logger } from "./common/logger";
import { CHAINS } from "./common/config";
import dotenv from "dotenv";

dotenv.config();
const logger = new Logger("EdgeCaseTester");

// Get test wallets from environment only
const getTestWallet = (envKey: string): ethers.Wallet => {
    const privateKey = process.env[envKey];
    
    if (!privateKey || privateKey.trim() === '') {
        logger.error(`${envKey} not set in .env`)
        logger.error(`Run 'npx tsx scripts/generate_random_wallets.ts' to generate new wallets`)
        process.exit(1)
    }
    
    logger.log(`Using wallet from ${envKey}`)
    return new ethers.Wallet(privateKey)
}

// Edge case scenarios
const EDGE_CASE_SCENARIOS: TestScenario[] = [
  {
    name: "Zero Duration (Instant)",
    startPrice: "0.001",
    endPrice: "0.001",
    duration: 1, // Nearly instant
    amount: "0.001"
  },
  {
    name: "Price Increase (Invalid)",
    startPrice: "0.001",
    endPrice: "0.002", // End > Start (should fail)
    duration: 60,
    amount: "0.001"
  },
  {
    name: "Very Long Duration",
    startPrice: "0.01",
    endPrice: "0.001",
    duration: 86400, // 24 hours
    amount: "0.001"
  },
  {
    name: "Tiny Amount",
    startPrice: "1",
    endPrice: "0.1",
    duration: 60,
    amount: "0.000000001" // 1 gwei
  },
  {
    name: "Large Price Drop",
    startPrice: "0.01",
    endPrice: "0.00001", // 99.9% drop
    duration: 120,
    amount: "0.001"
  }
];

export async function runEdgeCaseTests() {
  logger.log("Starting edge case tests...");

  const chain = "ethereum_sepolia"; // Use one chain for edge cases
  const sellerWallet = getTestWallet('SELLER_WALLET_PRIVATE_KEY');
  const resolverWallet = getTestWallet('RESOLVER1_WALLET_PRIVATE_KEY');

  const seller = new SellerService({
    privateKey: sellerWallet.privateKey,
    chains: [chain],
    auctionInterval: 1000000, // Don't auto-create
    testScenarios: []
  });

  const resolver = new FastResolver({
    id: "EDGE-TESTER",
    privateKey: resolverWallet.privateKey,
    maxPriceWei: "1", // High limit for edge cases
    minBalanceWei: "0.01",
    competitionDelayMs: 100,
    chains: [chain]
  });

  try {
    await seller.start();
    await resolver.start();

    // Test each edge case
    for (const scenario of EDGE_CASE_SCENARIOS) {
      logger.log(`\\nTesting edge case: ${scenario.name}`);
      
      try {
        await seller.createSpecificAuction(chain, scenario);
        
        // Wait for potential settlement
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        logger.success(`Edge case "${scenario.name}" completed`);
      } catch (error: any) {
        if (scenario.name.includes("Invalid")) {
          logger.success(`Edge case "${scenario.name}" correctly failed: ${error.message}`);
        } else {
          logger.error(`Edge case "${scenario.name}" failed unexpectedly:`, error.message);
        }
      }
    }

    // Test concurrent auctions
    logger.log("\\nTesting concurrent auctions...");
    const concurrentPromises = [];
    for (let i = 0; i < 5; i++) {
      concurrentPromises.push(
        seller.createSpecificAuction(chain, {
          name: `Concurrent-${i}`,
          startPrice: "0.002",
          endPrice: "0.001",
          duration: 60,
          amount: "0.001"
        })
      );
    }
    await Promise.all(concurrentPromises);
    logger.success("Concurrent auctions created");

    // Wait for settlements
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    logger.error("Edge case testing failed:", error);
  } finally {
    await seller.stop();
    await resolver.stop();
  }

  logger.log("Edge case testing completed!");
}

// Test race conditions
export async function testRaceConditions() {
  logger.log("\\nTesting race conditions with multiple resolvers...");

  const chain = "ethereum_sepolia";
  const sellerWallet = getTestWallet('SELLER_WALLET_PRIVATE_KEY');

  const seller = new SellerService({
    privateKey: sellerWallet.privateKey,
    chains: [chain],
    auctionInterval: 1000000,
    testScenarios: []
  });

  // Create 10 resolvers all trying to settle the same auction
  const resolvers = [];
  for (let i = 0; i < 10; i++) {
    const walletKey = i < 4 ? ['RESOLVER1_WALLET_PRIVATE_KEY', 'RESOLVER2_WALLET_PRIVATE_KEY', 'RESOLVER3_WALLET_PRIVATE_KEY', 'RESOLVER4_WALLET_PRIVATE_KEY'][i] : null;
    const wallet = walletKey ? getTestWallet(walletKey) : ethers.Wallet.createRandom();
    resolvers.push(new FastResolver({
      id: `RACE-${i}`,
      privateKey: wallet.privateKey,
      maxPriceWei: "0.01",
      minBalanceWei: "0.01",
      competitionDelayMs: 0, // No delay, maximum competition
      chains: [chain]
    }));
  }

  try {
    await seller.start();
    for (const resolver of resolvers) {
      await resolver.start();
    }

    // Create a single auction
    await seller.createSpecificAuction(chain, {
      name: "Race Condition Test",
      startPrice: "0.001",
      endPrice: "0.0005",
      duration: 30,
      amount: "0.001"
    });

    // Wait for race
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    logger.success("Race condition test completed - only one resolver should have won");

  } finally {
    await seller.stop();
    for (const resolver of resolvers) {
      await resolver.stop();
    }
  }
}

if (require.main === module) {
  (async () => {
    await runEdgeCaseTests();
    await testRaceConditions();
  })();
}