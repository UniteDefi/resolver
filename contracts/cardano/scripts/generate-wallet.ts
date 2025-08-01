// Note: Due to lucid-cardano being an ES module and this project using CommonJS,
// we need to use dynamic imports or adjust the module configuration
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

interface WalletInfo {
  privateKey: string;
  address: string;
  network: string;
  generatedAt: string;
}

const saveWalletToFile = (walletInfo: WalletInfo): string => {
  const walletsDir = path.join(__dirname, "../wallets");
  
  // Create wallets directory if it doesn't exist
  if (!fs.existsSync(walletsDir)) {
    fs.mkdirSync(walletsDir, { recursive: true });
  }
  
  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `wallet-${walletInfo.network}-${timestamp}.json`;
  const filePath = path.join(walletsDir, filename);
  
  // Save wallet info to file
  fs.writeFileSync(filePath, JSON.stringify(walletInfo, null, 2));
  
  return filePath;
};

const generateWallet = async (): Promise<WalletInfo> => {
  const network = "preprod";
  
  console.log(`[WalletGen] Generating new Cardano ${network} wallet...`);
  
  // Initialize provider (using Blockfrost for preprod)
  const projectId = process.env.BLOCKFROST_PREPROD_PROJECT_ID;
  
  if (!projectId) {
    console.error("[WalletGen] Error: BLOCKFROST_PREPROD_PROJECT_ID not set in environment");
    console.error("[WalletGen] Please add your Blockfrost project ID to .env file");
    process.exit(1);
  }
  
  try {
    console.log("[WalletGen] Loading lucid-cardano...");
    
    // Dynamic import to handle ES module
    const { Lucid, Blockfrost } = await import("lucid-cardano");
    
    // Create Blockfrost provider
    const provider = new Blockfrost(
      "https://cardano-preprod.blockfrost.io/api/v0",
      projectId
    );
    
    // Initialize Lucid
    const lucid = await Lucid.new(provider, "Preprod");
    
    // Generate new private key
    const privateKey = lucid.utils.generatePrivateKey();
    
    // Get address from private key
    lucid.selectWalletFromPrivateKey(privateKey);
    const address = await lucid.wallet.address();
    
    const walletInfo: WalletInfo = {
      privateKey,
      address,
      network,
      generatedAt: new Date().toISOString(),
    };
    
    return walletInfo;
    
  } catch (error) {
    console.error("[WalletGen] Error loading lucid-cardano or generating wallet:", error);
    console.log("[WalletGen] Falling back to simple private key generation...");
    
    // Fallback: generate private key without address derivation
    const privateKey = crypto.randomBytes(32).toString("hex");
    
    const walletInfo: WalletInfo = {
      privateKey,
      address: "Use lucid.selectWalletFromPrivateKey(privateKey) then lucid.wallet.address() to get address",
      network,
      generatedAt: new Date().toISOString(),
    };
    
    return walletInfo;
  }
};

async function main() {
  try {
    console.log("[WalletGen] Starting Cardano wallet generation...");
    
    const walletInfo = await generateWallet();
    
    console.log("\n=== WALLET GENERATED SUCCESSFULLY ===");
    console.log(`Network: ${walletInfo.network}`);
    console.log(`Address: ${walletInfo.address}`);
    console.log(`Private Key: ${walletInfo.privateKey}`);
    console.log(`Generated At: ${walletInfo.generatedAt}`);
    
    // Save to file
    const filePath = saveWalletToFile(walletInfo);
    console.log(`\n[WalletGen] Wallet details saved to: ${filePath}`);
    
    console.log("\n=== IMPORTANT SECURITY NOTES ===");
    console.log("1. NEVER share your private key with anyone");
    console.log("2. Store your private key securely");
    console.log("3. The wallet file contains sensitive information");
    console.log("4. Consider adding the wallets/ directory to .gitignore");
    
    console.log("\n=== NEXT STEPS ===");
    console.log("1. Fund your wallet using the Cardano testnet faucet:");
    console.log("   https://docs.cardano.org/cardano-testnet/tools/faucet/");
    console.log("2. Add your private key to .env file if needed for deployment:");
    console.log(`   PREPROD_WALLET_PRIVATE_KEY=${walletInfo.privateKey}`);
    
  } catch (error) {
    console.error("[WalletGen] Error generating wallet:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[WalletGen] Unhandled error:", error);
  process.exit(1);
});