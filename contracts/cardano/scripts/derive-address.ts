/**
 * Address derivation script for Cardano wallets
 * This script takes a private key and derives the corresponding Cardano address
 * Uses lucid-cardano to properly derive the address
 */

import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

interface AddressResult {
  privateKey: string;
  address: string;
  network: string;
  derivedAt: string;
}

const deriveAddress = async (privateKey: string, network: string = "preprod"): Promise<AddressResult> => {
  console.log(`[AddressDerivation] Deriving address for ${network} network...`);
  
  // Initialize provider (using Blockfrost for preprod)
  const projectId = process.env.BLOCKFROST_PREPROD_PROJECT_ID;
  
  if (!projectId) {
    console.error("[AddressDerivation] Error: BLOCKFROST_PREPROD_PROJECT_ID not set in environment");
    console.error("[AddressDerivation] Please add your Blockfrost project ID to .env file");
    process.exit(1);
  }
  
  try {
    console.log("[AddressDerivation] Loading lucid-cardano...");
    
    // Dynamic import to handle ES module
    const { Lucid, Blockfrost } = await import("lucid-cardano");
    
    // Create Blockfrost provider
    const provider = new Blockfrost(
      network === "preprod" 
        ? "https://cardano-preprod.blockfrost.io/api/v0"
        : "https://cardano-mainnet.blockfrost.io/api/v0",
      projectId
    );
    
    // Initialize Lucid
    const lucid = await Lucid.new(provider, network === "preprod" ? "Preprod" : "Mainnet");
    
    // Select wallet from private key
    lucid.selectWalletFromPrivateKey(privateKey);
    const address = await lucid.wallet.address();
    
    const result: AddressResult = {
      privateKey,
      address,
      network,
      derivedAt: new Date().toISOString(),
    };
    
    return result;
    
  } catch (error) {
    console.error("[AddressDerivation] Error loading lucid-cardano or deriving address:", error);
    throw new Error("Failed to derive address. Please ensure lucid-cardano is properly installed and configured.");
  }
};

const parseArgs = (): { privateKey?: string; walletFile?: string; network: string } => {
  const args = process.argv.slice(2);
  const config = {
    privateKey: undefined as string | undefined,
    walletFile: undefined as string | undefined,
    network: "preprod",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--private-key" || arg === "-k") && i + 1 < args.length) {
      config.privateKey = args[i + 1];
      i++;
    } else if ((arg === "--wallet-file" || arg === "-f") && i + 1 < args.length) {
      config.walletFile = args[i + 1];
      i++;
    } else if ((arg === "--network" || arg === "-n") && i + 1 < args.length) {
      config.network = args[i + 1];
      i++;
    }
  }

  return config;
};

const loadPrivateKeyFromFile = (filePath: string): string => {
  if (!fs.existsSync(filePath)) {
    console.error(`[AddressDerivation] Error: Wallet file not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const walletData = JSON.parse(fileContent);
    
    if (!walletData.privateKey) {
      console.error("[AddressDerivation] Error: No private key found in wallet file");
      process.exit(1);
    }

    return walletData.privateKey;
  } catch (error) {
    console.error("[AddressDerivation] Error reading wallet file:", error);
    process.exit(1);
  }
};

async function main() {
  try {
    console.log("[AddressDerivation] Starting Cardano address derivation...");
    
    const config = parseArgs();
    
    let privateKey: string;
    
    if (config.privateKey) {
      privateKey = config.privateKey;
      console.log("[AddressDerivation] Using private key from command line");
    } else if (config.walletFile) {
      privateKey = loadPrivateKeyFromFile(config.walletFile);
      console.log(`[AddressDerivation] Using private key from wallet file: ${config.walletFile}`);
    } else {
      console.error("[AddressDerivation] Error: No private key provided");
      console.log("Usage:");
      console.log("  npm run derive-address -- --private-key <key> [--network preprod|mainnet]");
      console.log("  npm run derive-address -- --wallet-file <path> [--network preprod|mainnet]");
      console.log("");
      console.log("Examples:");
      console.log("  npm run derive-address -- --private-key 8362b47cbd3ee3e92ae06e6f952227de5df627cf3fe63613dde3e132b22dc7c7");
      console.log("  npm run derive-address -- --wallet-file ./wallets/wallet-preprod-2025-08-01T14-41-31-097Z.json");
      process.exit(1);
    }
    
    const result = await deriveAddress(privateKey, config.network);
    
    console.log("\n=== ADDRESS DERIVED SUCCESSFULLY ===");
    console.log(`Network: ${result.network}`);
    console.log(`Address: ${result.address}`);
    console.log(`Private Key: ${result.privateKey}`);
    console.log(`Derived At: ${result.derivedAt}`);
    
    console.log("\n=== NEXT STEPS ===");
    console.log("1. Fund your wallet using the Cardano testnet faucet:");
    console.log("   https://docs.cardano.org/cardano-testnet/tools/faucet/");
    console.log(`2. Your wallet address: ${result.address}`);
    console.log("3. Add your private key to .env file if needed for deployment:");
    console.log(`   PREPROD_WALLET_PRIVATE_KEY=${result.privateKey}`);
    
  } catch (error) {
    console.error("[AddressDerivation] Error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[AddressDerivation] Unhandled error:", error);
  process.exit(1);
});