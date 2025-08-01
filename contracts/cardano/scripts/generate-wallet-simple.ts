/**
 * Simple Cardano wallet generation script
 * This script generates a new private key and address for Cardano preprod testnet
 * Uses only cryptographic functions without requiring network connectivity
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

interface WalletInfo {
  privateKey: string;
  address: string;
  network: string;
  generatedAt: string;
  note: string;
}

/**
 * Generate a cryptographically secure random hex string
 */
const generatePrivateKey = (): string => {
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString("hex");
};

/**
 * Save wallet information to a file
 */
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

async function main() {
  try {
    console.log("[WalletGen] Starting simple Cardano wallet generation...");
    
    // Generate private key
    const privateKey = generatePrivateKey();
    
    console.log("[WalletGen] Private key generated successfully");
    
    const walletInfo: WalletInfo = {
      privateKey,
      address: "Address generation requires lucid-cardano setup",
      network: "preprod",
      generatedAt: new Date().toISOString(),
      note: "This private key can be used with lucid-cardano to derive the actual address. Use: lucid.selectWalletFromPrivateKey(privateKey) then lucid.wallet.address()"
    };
    
    console.log("\n=== WALLET GENERATED SUCCESSFULLY ===");
    console.log(`Network: ${walletInfo.network}`);
    console.log(`Private Key: ${walletInfo.privateKey}`);
    console.log(`Generated At: ${walletInfo.generatedAt}`);
    console.log(`Note: ${walletInfo.note}`);
    
    // Save to file
    const filePath = saveWalletToFile(walletInfo);
    console.log(`\n[WalletGen] Wallet details saved to: ${filePath}`);
    
    console.log("\n=== IMPORTANT SECURITY NOTES ===");
    console.log("1. NEVER share your private key with anyone");
    console.log("2. Store your private key securely");
    console.log("3. The wallet file contains sensitive information");
    console.log("4. Consider adding the wallets/ directory to .gitignore");
    
    console.log("\n=== NEXT STEPS ===");
    console.log("1. To get the actual address, use this private key with lucid-cardano:");
    console.log("   lucid.selectWalletFromPrivateKey(privateKey)");
    console.log("   const address = await lucid.wallet.address()");
    console.log("2. Fund your wallet using the Cardano testnet faucet:");
    console.log("   https://docs.cardano.org/cardano-testnet/tools/faucet/");
    console.log("3. Add your private key to .env file if needed for deployment:");
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