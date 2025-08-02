import { AptosAccount } from "aptos";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as dotenv from "dotenv";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function setup() {
  console.log("🚀 Unite DeFi - Aptos Setup Wizard");
  console.log("==================================\n");

  const envPath = path.join(__dirname, "..", ".env");
  let envConfig: Record<string, string> = {};

  // Load existing .env if it exists
  if (fs.existsSync(envPath)) {
    console.log("📄 Found existing .env file");
    const useExisting = await question("Do you want to use the existing configuration? (y/n): ");
    
    if (useExisting.toLowerCase() === "y") {
      dotenv.config({ path: envPath });
      envConfig = process.env as any;
    }
  }

  // Network configuration
  console.log("\n🌐 Network Configuration");
  console.log("1. Testnet (recommended for development)");
  console.log("2. Devnet");
  console.log("3. Mainnet");
  console.log("4. Custom");

  const networkChoice = await question("Select network (1-4): ");
  
  switch (networkChoice) {
    case "1":
      envConfig.APTOS_NODE_URL = "https://fullnode.testnet.aptoslabs.com";
      envConfig.APTOS_FAUCET_URL = "https://faucet.testnet.aptoslabs.com";
      envConfig.APTOS_NETWORK = "testnet";
      break;
    case "2":
      envConfig.APTOS_NODE_URL = "https://fullnode.devnet.aptoslabs.com";
      envConfig.APTOS_FAUCET_URL = "https://faucet.devnet.aptoslabs.com";
      envConfig.APTOS_NETWORK = "devnet";
      break;
    case "3":
      envConfig.APTOS_NODE_URL = "https://fullnode.mainnet.aptoslabs.com";
      envConfig.APTOS_NETWORK = "mainnet";
      delete envConfig.APTOS_FAUCET_URL;
      break;
    case "4":
      envConfig.APTOS_NODE_URL = await question("Enter custom node URL: ");
      envConfig.APTOS_FAUCET_URL = await question("Enter custom faucet URL (leave empty if none): ");
      envConfig.APTOS_NETWORK = "custom";
      break;
    default:
      console.log("Invalid choice, using testnet");
      envConfig.APTOS_NODE_URL = "https://fullnode.testnet.aptoslabs.com";
      envConfig.APTOS_FAUCET_URL = "https://faucet.testnet.aptoslabs.com";
      envConfig.APTOS_NETWORK = "testnet";
  }

  // Account configuration
  console.log("\n🔑 Account Configuration");
  const hasPrivateKey = await question("Do you have an existing Aptos private key? (y/n): ");
  
  if (hasPrivateKey.toLowerCase() === "y") {
    const privateKey = await question("Enter your private key (hex format): ");
    envConfig.APTOS_PRIVATE_KEY = privateKey.replace("0x", "");
    
    // Validate and show address
    try {
      const account = new AptosAccount(
        Uint8Array.from(Buffer.from(envConfig.APTOS_PRIVATE_KEY, "hex"))
      );
      console.log(`✅ Account address: ${account.address().hex()}`);
    } catch (error) {
      console.error("❌ Invalid private key!");
      process.exit(1);
    }
  } else {
    console.log("🔐 Generating new account...");
    const account = new AptosAccount();
    envConfig.APTOS_PRIVATE_KEY = Buffer.from(account.signingKey.secretKey).toString("hex");
    
    console.log("\n🎉 New account created!");
    console.log(`Address: ${account.address().hex()}`);
    console.log(`Private Key: ${envConfig.APTOS_PRIVATE_KEY}`);
    console.log("\n⚠️  IMPORTANT: Save this private key securely!");
  }

  // EVM configuration for cross-chain
  console.log("\n🌉 Cross-chain Configuration");
  const configureEvm = await question("Do you want to configure EVM chain settings? (y/n): ");
  
  if (configureEvm.toLowerCase() === "y") {
    envConfig.EVM_RPC_URL = await question("Enter EVM RPC URL (e.g., Ethereum Sepolia): ");
    envConfig.EVM_PRIVATE_KEY = await question("Enter EVM private key: ");
    envConfig.EVM_CHAIN_ID = await question("Enter EVM chain ID (e.g., 11155111 for Sepolia): ");
  }

  // Save configuration
  console.log("\n💾 Saving configuration...");
  
  const envContent = Object.entries(envConfig)
    .filter(([_, value]) => value) // Remove empty values
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  fs.writeFileSync(envPath, envContent);
  console.log("✅ Configuration saved to .env");

  // Create .env.example
  const exampleContent = Object.entries(envConfig)
    .filter(([_, value]) => value)
    .map(([key, _]) => `${key}=`)
    .join("\n");

  fs.writeFileSync(path.join(__dirname, "..", ".env.example"), exampleContent);
  console.log("✅ Created .env.example");

  // Final instructions
  console.log("\n🎯 Setup complete!");
  console.log("\nNext steps:");
  console.log("1. Run 'yarn install' to install dependencies");
  console.log("2. Run 'yarn deploy' to deploy the contracts");
  console.log("3. Run 'yarn test' to run the test suite");

  if (envConfig.APTOS_NETWORK !== "mainnet" && !hasPrivateKey.toLowerCase()) {
    console.log("\n💰 Don't forget to fund your account using the faucet!");
    console.log(`   Visit: ${envConfig.APTOS_FAUCET_URL}`);
  }

  rl.close();
}

// Run setup
setup().catch((error) => {
  console.error("Setup failed:", error);
  rl.close();
  process.exit(1);
});