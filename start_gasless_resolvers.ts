import { GaslessResolver } from "./services/resolvers/gasless_resolver";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const RELAYER_URL = "http://localhost:3000";

const chains = [
  {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  },
  {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  }
];

async function startResolvers() {
  console.log("🚀 Starting Gasless Resolver Services");
  console.log(`📡 Relayer URL: ${RELAYER_URL}`);
  console.log("=".repeat(50));
  
  // Create resolvers with different strategies
  const resolvers = [
    new GaslessResolver(
      "Fast Resolver",
      process.env.RESOLVER1_WALLET_PRIVATE_KEY!,
      RELAYER_URL,
      chains,
      0.5,  // Min profit $0.50
      3000  // Check every 3 seconds
    ),
    new GaslessResolver(
      "Balanced Resolver",
      process.env.RESOLVER2_WALLET_PRIVATE_KEY!,
      RELAYER_URL,
      chains,
      1.0,  // Min profit $1.00
      5000  // Check every 5 seconds
    )
  ];
  
  // Start all resolvers
  console.log("\n🤖 Starting resolver services:");
  for (const resolver of resolvers) {
    await resolver.start();
  }
  
  console.log("\n✅ All resolver services started!");
  console.log("📊 Monitoring for profitable cross-chain swaps...\n");
  
  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Shutting down resolver services...");
    for (const resolver of resolvers) {
      resolver.stop();
    }
    process.exit(0);
  });
}

startResolvers().catch(error => {
  console.error("Failed to start resolver services:", error);
  process.exit(1);
});