#!/usr/bin/env ts-node

/**
 * Complete Setup Demo for Unite Protocol Sui Implementation
 * 
 * This script demonstrates the full workflow from deployment to cross-chain swap execution.
 * Run with: npx ts-node scripts/setup_demo.ts
 */

import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { deploySuiContracts, updateDeploymentsJson } from "./deploy";
import { fundResolver, checkBalances } from "./fund_resolvers";

dotenv.config({ path: path.join(__dirname, "../.env") });

interface DemoConfig {
  network: string;
  skipDeployment: boolean;
  skipFunding: boolean;
  runCrossChainDemo: boolean;
}

const DEFAULT_CONFIG: DemoConfig = {
  network: process.env.SUI_NETWORK || "testnet",
  skipDeployment: false,
  skipFunding: false,
  runCrossChainDemo: true,
};

async function generateTestWallets(): Promise<{
  user: Ed25519Keypair;
  resolver1: Ed25519Keypair;
  resolver2: Ed25519Keypair;
  resolver3: Ed25519Keypair;
}> {
  console.log("\n=== GENERATING TEST WALLETS ===");
  
  const user = new Ed25519Keypair();
  const resolver1 = new Ed25519Keypair();
  const resolver2 = new Ed25519Keypair();
  const resolver3 = new Ed25519Keypair();
  
  console.log("Test User:", user.toSuiAddress());
  console.log("Resolver 1:", resolver1.toSuiAddress());
  console.log("Resolver 2:", resolver2.toSuiAddress());
  console.log("Resolver 3:", resolver3.toSuiAddress());
  
  // Update .env with test keys
  const envPath = path.join(__dirname, "../.env");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }
  
  // Add test keys to env
  const testKeys = `
# Test wallets for demo (generated automatically)
SUI_TEST_USER_PRIVATE_KEY=${user.export().privateKey}
SUI_RESOLVER_PRIVATE_KEY_0=${resolver1.export().privateKey}
SUI_RESOLVER_PRIVATE_KEY_1=${resolver2.export().privateKey}
SUI_RESOLVER_PRIVATE_KEY_2=${resolver3.export().privateKey}
`;
  
  // Only add if not already present
  if (!envContent.includes("SUI_TEST_USER_PRIVATE_KEY")) {
    fs.writeFileSync(envPath, envContent + testKeys);
    console.log("✅ Test wallet keys added to .env");
  }
  
  return { user, resolver1, resolver2, resolver3 };
}

async function verifyEnvironment(): Promise<void> {
  console.log("\n=== ENVIRONMENT VERIFICATION ===");
  
  const required = [
    'SUI_RPC_URL',
    'SUI_NETWORK',
    'SUI_PRIVATE_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log("❌ Missing required environment variables:");
    missing.forEach(key => console.log(`   - ${key}`));
    console.log("\nPlease set these in your .env file:");
    console.log("   SUI_RPC_URL=https://fullnode.testnet.sui.io");
    console.log("   SUI_NETWORK=testnet");
    console.log("   SUI_PRIVATE_KEY=your_private_key_hex");
    throw new Error("Environment setup incomplete");
  }
  
  // Check if main wallet has funds
  const client = new SuiClient({ url: process.env.SUI_RPC_URL! });
  const deployer = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_PRIVATE_KEY!, "hex"));
  
  const balance = await client.getBalance({ owner: deployer.toSuiAddress() });
  const suiAmount = parseInt(balance.totalBalance) / 1e9;
  
  console.log("Deployer address:", deployer.toSuiAddress());
  console.log("Deployer SUI balance:", suiAmount.toFixed(4));
  
  if (suiAmount < 1) {
    console.log("⚠️ Low SUI balance. You may need more SUI for deployment and testing.");
    console.log(`   Fund at: https://faucet.${process.env.SUI_NETWORK}.sui.io`);
    console.log(`   Address: ${deployer.toSuiAddress()}`);
  }
  
  console.log("✅ Environment verification complete");
}

async function deployContracts(network: string): Promise<any> {
  console.log("\n=== DEPLOYING SUI CONTRACTS ===");
  console.log(`Deploying to Sui ${network}...`);
  
  try {
    const deployment = await deploySuiContracts();
    await updateDeploymentsJson(deployment, network);
    
    console.log("✅ Deployment successful!");
    console.log("Package ID:", deployment.packageId);
    console.log("EscrowFactory:", deployment.escrowFactory);
    console.log("LimitOrderProtocol:", deployment.limitOrderProtocol);
    console.log("MockUSDC:", deployment.mockUSDC);
    
    return deployment;
  } catch (error: any) {
    console.log("❌ Deployment failed:", error.message);
    throw error;
  }
}

async function fundTestAccounts(deployment: any): Promise<void> {
  console.log("\n=== FUNDING TEST ACCOUNTS ===");
  
  const client = new SuiClient({ url: process.env.SUI_RPC_URL! });
  const funder = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_PRIVATE_KEY!, "hex"));
  
  // Get test wallets from environment
  const testWallets = await generateTestWallets();
  
  const addresses = [
    testWallets.user.toSuiAddress(),
    testWallets.resolver1.toSuiAddress(),
    testWallets.resolver2.toSuiAddress(),
    testWallets.resolver3.toSuiAddress(),
  ];
  
  console.log("Funding test accounts...");
  
  for (const address of addresses) {
    await fundResolver(
      client,
      funder,
      address,
      { suiAmount: 5, usdcAmount: 500 }, // 5 SUI + 500 USDC each
      deployment
    );
    
    // Small delay between transactions
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log("✅ Test accounts funded");
  
  // Check final balances
  await checkBalances(client, addresses, deployment);
}

async function demonstrateCrossChainFlow(): Promise<void> {
  console.log("\n=== CROSS-CHAIN DEMO SIMULATION ===");
  
  console.log("This demo simulates the cross-chain swap flow:");
  console.log("1. 📝 User creates order on Base Sepolia");
  console.log("2. 🔒 Resolvers deploy source escrows with USDT");
  console.log("3. 🌉 Resolvers deploy destination escrows on Sui");
  console.log("4. 💰 Resolvers deposit SUI tokens to escrows");
  console.log("5. 🎯 User funds transferred to source escrow");
  console.log("6. 🔓 Secret revealed publicly");
  console.log("7. ✅ Permissionless withdrawals execute");
  console.log("8. 🎉 User gets SUI, resolvers get USDT");
  
  console.log("\n📋 To run the actual cross-chain test:");
  console.log("   npm run test:cross-chain");
  
  console.log("\n🔗 Cross-chain pairs supported:");
  console.log("   • Base Sepolia USDT ↔ Sui Testnet SUI");
  console.log("   • Arbitrum Sepolia DAI ↔ Sui Testnet SUI");
  console.log("   • Custom ERC20 ↔ Sui Testnet SUI");
  
  console.log("\n⚙️ Key features demonstrated:");
  console.log("   • Atomic cross-chain swaps");
  console.log("   • Multiple resolver participation");
  console.log("   • Partial fill support");
  console.log("   • Safety deposit mechanisms");
  console.log("   • Permissionless execution");
  console.log("   • Time-based fallbacks");
}

async function showNextSteps(deployment: any): Promise<void> {
  console.log("\n=== NEXT STEPS ===");
  
  console.log("🎯 Ready for testing! You can now:");
  console.log("");
  console.log("1. Run unit tests:");
  console.log("   npm run test:unit");
  console.log("");
  console.log("2. Run cross-chain integration tests:");
  console.log("   npm run test:cross-chain");
  console.log("");
  console.log("3. Interact with contracts manually:");
  console.log("   npx ts-node -e \"");
  console.log("     import { SuiClient } from '@mysten/sui.js/client';");
  console.log("     const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io' });");
  console.log("     // Your interaction code here");
  console.log("   \"");
  console.log("");
  console.log("4. Check deployment on Sui Explorer:");
  console.log(`   https://suiexplorer.com/object/${deployment.packageId}?network=${process.env.SUI_NETWORK}`);
  console.log("");
  console.log("📋 Contract addresses saved in deployments.json");
  console.log("🔑 Test wallet keys saved in .env");
  console.log("💰 Test accounts funded with SUI and USDC");
  
  console.log("\n🌉 Cross-chain testing requirements:");
  console.log("   • Set BASE_SEPOLIA_RPC_URL in .env");
  console.log("   • Set PRIVATE_KEY (EVM wallet) in .env");
  console.log("   • Set RESOLVER_PRIVATE_KEY_0, _1, _2 (EVM) in .env");
  console.log("   • Ensure EVM accounts have ETH and test tokens");
  
  console.log("\n🎉 Setup complete! Happy testing!");
}

async function main(): Promise<void> {
  console.log("🚀 Unite Protocol Sui Implementation - Complete Setup Demo");
  console.log("================================================================");
  
  try {
    const config = DEFAULT_CONFIG;
    
    // Step 1: Verify environment
    await verifyEnvironment();
    
    // Step 2: Generate test wallets
    await generateTestWallets();
    
    // Step 3: Deploy contracts (unless skipped)
    let deployment;
    if (!config.skipDeployment) {
      deployment = await deployContracts(config.network);
    } else {
      console.log("⚠️ Skipping deployment (use existing contracts)");
      // Load existing deployment
      const deploymentsPath = path.join(__dirname, "../deployments.json");
      if (fs.existsSync(deploymentsPath)) {
        const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
        deployment = deployments.sui?.[config.network];
      }
    }
    
    if (!deployment) {
      throw new Error("No deployment found. Run with deployment enabled.");
    }
    
    // Step 4: Fund test accounts (unless skipped)
    if (!config.skipFunding) {
      await fundTestAccounts(deployment);
    } else {
      console.log("⚠️ Skipping funding (use existing balances)");
    }
    
    // Step 5: Demonstrate cross-chain flow (unless skipped)
    if (config.runCrossChainDemo) {
      await demonstrateCrossChainFlow();
    }
    
    // Step 6: Show next steps
    await showNextSteps(deployment);
    
  } catch (error: any) {
    console.error("\n❌ Setup failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Check your .env file configuration");
    console.error("2. Ensure you have sufficient SUI balance");
    console.error("3. Verify network connectivity");
    console.error("4. Check Sui CLI installation: sui --version");
    console.error("5. Try running components individually");
    process.exit(1);
  }
}

// CLI argument parsing
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const config = { ...DEFAULT_CONFIG };
  
  args.forEach(arg => {
    switch (arg) {
      case "--skip-deployment":
        config.skipDeployment = true;
        break;
      case "--skip-funding":
        config.skipFunding = true;
        break;
      case "--no-demo":
        config.runCrossChainDemo = false;
        break;
      case "--devnet":
        config.network = "devnet";
        break;
      case "--testnet":
        config.network = "testnet";
        break;
      case "--help":
        console.log("Usage: npx ts-node scripts/setup_demo.ts [options]");
        console.log("");
        console.log("Options:");
        console.log("  --skip-deployment    Skip contract deployment");
        console.log("  --skip-funding       Skip account funding");
        console.log("  --no-demo           Skip cross-chain demo");
        console.log("  --devnet            Use Sui devnet");
        console.log("  --testnet           Use Sui testnet (default)");
        console.log("  --help              Show this help");
        process.exit(0);
    }
  });
  
  // Update environment with network choice
  process.env.SUI_NETWORK = config.network;
  if (!process.env.SUI_RPC_URL) {
    process.env.SUI_RPC_URL = `https://fullnode.${config.network}.sui.io`;
  }
  
  main();
}

export { main, DemoConfig };