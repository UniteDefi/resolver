import { waitForFunding } from "./WaitForFunding";
import { checkBalances } from "./CheckBalances";
import { execSync } from "child_process";

async function fullDeployment() {
  console.log("🚀 Starting Full XRPL Unite Protocol Deployment\n");
  
  try {
    // Step 1: Check current balances
    console.log("1️⃣ Checking current wallet balances...");
    await checkBalances();
    
    // Step 2: Wait for sufficient funding
    console.log("\n2️⃣ Waiting for deployer funding...");
    await waitForFunding();
    
    // Step 3: Deploy contracts
    console.log("\n3️⃣ Deploying contracts...");
    execSync("npm run deploy", { stdio: "inherit" });
    
    // Step 4: Fund all wallets
    console.log("\n4️⃣ Funding all wallets...");
    execSync('FUND_TARGETS="all" FUND_AMOUNT="1000" npm run fund-wallets', { 
      stdio: "inherit",
      env: { ...process.env, FUND_TARGETS: "all", FUND_AMOUNT: "1000" }
    });
    
    // Step 5: Final balance check
    console.log("\n5️⃣ Final balance verification...");
    await checkBalances();
    
    console.log("\n🎉 DEPLOYMENT COMPLETE!");
    console.log("✅ All contracts deployed");
    console.log("✅ All wallets funded");
    console.log("✅ Ready for cross-chain testing");
    console.log("\n📋 Next Steps:");
    console.log("   1. Provide Base Sepolia deployment info");
    console.log("   2. Run: npm test");
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  fullDeployment().catch(console.error);
}

export { fullDeployment };