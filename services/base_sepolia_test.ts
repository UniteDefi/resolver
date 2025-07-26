import dotenv from "dotenv";
dotenv.config();
import { TokenSellerService } from "./seller/token_seller_service";
import { TokenBaseResolver } from "./resolvers/token_base_resolver";
import { Logger } from "./common/logger";
import fs from "fs";
import path from "path";

const logger = new Logger("BaseSepolia-Test");

// Different resolver strategies
class FastTokenResolver extends TokenBaseResolver {
  constructor(config: any) {
    super(config);
    this.logger.log("Fast resolver - minimal delays, aggressive pricing");
  }
}

class BalancedTokenResolver extends TokenBaseResolver {
  constructor(config: any) {
    super(config);
    this.logger.log("Balanced resolver - moderate delays and pricing");
  }
}

async function main() {
  logger.log("Starting Base Sepolia token auction test...");
  
  // Load deployment info
  let deploymentInfo;
  try {
    deploymentInfo = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "deployments_base_sepolia.json"),
        "utf8"
      )
    );
  } catch (error) {
    logger.error("No deployment info found. Run deploy_tokens_base.ts first!");
    process.exit(1);
  }
  
  const { mockUSDT, mockLINK, auctionContract } = deploymentInfo;
  
  logger.log("Using contracts:");
  logger.log(`  Auction: ${auctionContract}`);
  logger.log(`  USDT: ${mockUSDT}`);
  logger.log(`  LINK: ${mockLINK}`);
  
  // Create seller
  const seller = new TokenSellerService({
    privateKey: process.env.SELLER_WALLET_PRIVATE_KEY!,
    chain: "base_sepolia",
    auctionContract,
    tokenAddresses: {
      usdt: mockUSDT,
      link: mockLINK,
    },
    auctionInterval: 30000, // New auction every 30 seconds
  });
  
  // Create resolvers with different strategies
  const resolvers = [
    new FastTokenResolver({
      id: "FAST-1",
      privateKey: process.env.RESOLVER1_WALLET_PRIVATE_KEY!,
      chain: "base_sepolia",
      auctionContract,
      maxPricePerToken: {
        usdt: "0.0003", // Max 0.0003 ETH per USDT
        link: "0.003", // Max 0.003 ETH per LINK
      },
      minEthBalance: "0.0005",
      competitionDelayMs: 100, // Very fast
    }),
    new BalancedTokenResolver({
      id: "BALANCED-1",
      privateKey: process.env.RESOLVER2_WALLET_PRIVATE_KEY!,
      chain: "base_sepolia",
      auctionContract,
      maxPricePerToken: {
        usdt: "0.00028", // Slightly lower max price
        link: "0.0028",
      },
      minEthBalance: "0.0005",
      competitionDelayMs: 1000, // Wait 1 second
    }),
  ];
  
  // Log wallet addresses
  logger.log("\nWallet addresses:");
  logger.log(`Seller: ${process.env.SELLER_WALLET_PRIVATE_KEY ? "✓ Configured" : "✗ Missing"}`);
  logger.log(`Resolver 1: ${process.env.RESOLVER1_WALLET_PRIVATE_KEY ? "✓ Configured" : "✗ Missing"}`);
  logger.log(`Resolver 2: ${process.env.RESOLVER2_WALLET_PRIVATE_KEY ? "✓ Configured" : "✗ Missing"}`);
  
  // Start all services
  try {
    // Start resolvers first so they're listening
    logger.log("\nStarting resolvers...");
    for (const resolver of resolvers) {
      await resolver.start();
    }
    
    // Wait a bit then start seller
    logger.log("\nStarting seller in 3 seconds...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await seller.start();
    
    logger.success("\n🚀 All services started!");
    logger.log("📊 Token auction competition is now active on Base Sepolia.");
    logger.log("Press Ctrl+C to stop.\n");
    
    // Handle shutdown
    process.on("SIGINT", async () => {
      logger.log("\n\nShutting down services...");
      
      await seller.stop();
      for (const resolver of resolvers) {
        await resolver.stop();
      }
      
      logger.success("All services stopped.");
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start services:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main };