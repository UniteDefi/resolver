import { ethers } from "ethers";
import fs from "fs";
import path from "path";

console.log("[WalletGenerator] Generating new random wallets...\n");

// Generate 5 completely random wallets
const wallets = {
  SELLER_WALLET_PRIVATE_KEY: ethers.Wallet.createRandom(),
  RESOLVER1_WALLET_PRIVATE_KEY: ethers.Wallet.createRandom(),
  RESOLVER2_WALLET_PRIVATE_KEY: ethers.Wallet.createRandom(),
  RESOLVER3_WALLET_PRIVATE_KEY: ethers.Wallet.createRandom(),
  RESOLVER4_WALLET_PRIVATE_KEY: ethers.Wallet.createRandom(),
};

console.log("Generated wallets:");
console.log("=================");
Object.entries(wallets).forEach(([key, wallet]) => {
  console.log(`\n${key}:`);
  console.log(`  Address: ${wallet.address}`);
  console.log(`  Private Key: ${wallet.privateKey}`);
});

// Generate .env content
const envContent = Object.entries(wallets)
  .map(([key, wallet]) => `${key}=${wallet.privateKey}`)
  .join("\n");

console.log("\n\nAdd these to your .env file:");
console.log("=============================");
console.log(envContent);

// Save to a file for easy copying
const outputPath = path.join(process.cwd(), "generated_wallets.txt");
fs.writeFileSync(outputPath, `# Generated Random Wallets\n# ${new Date().toISOString()}\n\n${envContent}\n`);
console.log(`\n\nWallet keys saved to: ${outputPath}`);

console.log("\n[WalletGenerator] ⚠️  IMPORTANT: These wallets need to be funded before use!");
console.log("[WalletGenerator] Run 'yarn fund:wallets' after updating your .env file.");