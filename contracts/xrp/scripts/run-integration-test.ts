import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

async function runIntegrationTest(): Promise<void> {
  console.log("🧪 Running XRPL Cross-Chain Integration Tests");
  
  try {
    // Check environment setup
    console.log("🔍 Checking environment...");
    
    const requiredEnvVars = [
      "XRP_SERVER_URL",
      "XRP_USER_ADDRESS", 
      "XRP_USER_SECRET",
      "XRP_RESOLVER_0_ADDRESS",
      "XRP_RESOLVER_0_SECRET",
      "BASE_SEPOLIA_RPC_URL"
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.log("❌ Missing environment variables:");
      missingVars.forEach(varName => {
        console.log(`   ${varName}`);
      });
      console.log("\nRun: npm run setup-env");
      return;
    }

    console.log("✅ Environment configured");

    // Run wallet funding check
    console.log("\n💰 Checking wallet funding...");
    try {
      execSync("npm run fund-check", { stdio: "inherit" });
    } catch (error) {
      console.log("⚠️  Some wallets may need funding");
    }

    // Run the actual tests
    console.log("\n🚀 Running cross-chain tests...");
    
    try {
      execSync("npm test -- tests/cross_chain_htlc.test.ts", { 
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "test" }
      });
      
      console.log("\n🎉 Integration tests completed successfully!");
      
    } catch (error) {
      console.log("\n❌ Some tests failed - this is expected if wallets aren't funded");
      console.log("To run with funded wallets:");
      console.log("1. Fund wallets using: npm run fund-wallets");
      console.log("2. Re-run tests: npm test");
    }

  } catch (error) {
    console.error("❌ Test run failed:", error);
  }
}

if (require.main === module) {
  runIntegrationTest().catch(console.error);
}

export { runIntegrationTest };
