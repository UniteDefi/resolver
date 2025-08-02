import * as fs from "fs";
import * as path from "path";
import checkAccounts from "./check-accounts";
import checkBalances from "./check-balances";

async function verifySetup() {
  console.log("🔍 Verifying complete setup...");
  
  // Check if all files exist
  const requiredFiles = [
    "src/lib.cairo",
    "src/unite_limit_order_protocol.cairo",
    "src/unite_escrow_factory.cairo", 
    "src/unite_escrow.cairo",
    "src/unite_resolver.cairo",
    "scripts/deploy-all.ts",
    "scripts/fund-resolvers.ts",
    "tests/crosschain-swap.test.ts",
    "tests/starknet-contracts.test.ts",
    "tests/integration.test.ts",
    "package.json",
    "Scarb.toml",
    ".env.example"
  ];
  
  console.log("\n📁 Checking required files...");
  let allFilesExist = true;
  
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} - MISSING`);
      allFilesExist = false;
    }
  }
  
  // Check .env configuration
  console.log("\n⚙️ Checking environment configuration...");
  
  if (fs.existsSync(".env")) {
    console.log("✅ .env file exists");
    
    const requiredEnvVars = [
      "STARKNET_ACCOUNT_ADDRESS",
      "STARKNET_PRIVATE_KEY",
      "STARKNET_RPC_URL"
    ];
    
    const envContent = fs.readFileSync(".env", "utf8");
    const missingVars = requiredEnvVars.filter(varName => 
      !envContent.includes(varName) || envContent.includes(`${varName}=`)
    );
    
    if (missingVars.length === 0) {
      console.log("✅ Required environment variables configured");
    } else {
      console.log(`⚠️ Missing environment variables: ${missingVars.join(", ")}`);
    }
  } else {
    console.log("⚠️ .env file not found - copy from .env.example");
  }
  
  // Check package.json dependencies
  console.log("\n📦 Checking dependencies...");
  
  if (fs.existsSync("package.json")) {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const hasDeps = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0;
    const hasDevDeps = packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0;
    
    if (hasDeps && hasDevDeps) {
      console.log("✅ Dependencies configured");
      console.log("💡 Run 'yarn install' to install dependencies");
    } else {
      console.log("❌ Dependencies not properly configured");
    }
  }
  
  // Check Scarb configuration
  console.log("\n🏗️ Checking Scarb configuration...");
  
  if (fs.existsSync("Scarb.toml")) {
    console.log("✅ Scarb.toml exists");
    console.log("💡 Run 'scarb build' to compile contracts");
  } else {
    console.log("❌ Scarb.toml missing");
  }
  
  // Summary
  console.log("\n📋 Setup Summary:");
  console.log(`Files: ${allFilesExist ? "✅" : "❌"} ${allFilesExist ? "All required files present" : "Some files missing"}`);
  console.log(`Config: ${fs.existsSync(".env") ? "✅" : "⚠️"} Environment ${fs.existsSync(".env") ? "configured" : "needs setup"}`);
  console.log(`Scarb: ${fs.existsSync("Scarb.toml") ? "✅" : "❌"} ${fs.existsSync("Scarb.toml") ? "Ready" : "Missing"}`);
  
  if (allFilesExist && fs.existsSync(".env") && fs.existsSync("Scarb.toml")) {
    console.log("\n🎉 SETUP COMPLETE!");
    console.log("\nNext steps:");
    console.log("1. yarn install           # Install dependencies");
    console.log("2. yarn build             # Compile contracts");
    console.log("3. yarn accounts:check    # Verify account configuration");
    console.log("4. yarn deploy:all        # Deploy contracts");
    console.log("5. yarn test:crosschain   # Test cross-chain swaps");
    
    // Run account check if .env exists
    if (fs.existsSync(".env")) {
      console.log("\n🔍 Running account verification...");
      try {
        await checkAccounts();
      } catch (error) {
        console.log("⚠️ Account check failed - ensure .env is properly configured");
      }
    }
  } else {
    console.log("\n❌ Setup incomplete - fix the issues above");
  }
}

if (require.main === module) {
  verifySetup().catch(console.error);
}

export default verifySetup;
