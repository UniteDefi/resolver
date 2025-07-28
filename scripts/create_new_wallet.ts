import { ethers } from "ethers";
import fs from "fs";
import path from "path";

function createNewWallet() {
  console.log("[CreateNewWallet] Generating new wallet for deployment...\n");
  
  // Generate a new random wallet
  const wallet = ethers.Wallet.createRandom();
  
  console.log("🔑 New Wallet Generated:");
  console.log("=======================");
  console.log("Address:", wallet.address);
  console.log("Private Key:", wallet.privateKey);
  console.log("\n📋 Please fund this address with 0.2 ETH on:");
  console.log("- Ethereum Sepolia");
  console.log("- Base Sepolia");
  
  // Save to a file for reference
  const walletInfo = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: new Date().toISOString()
  };
  
  const walletPath = path.join(process.cwd(), "new_deployer_wallet.json");
  fs.writeFileSync(walletPath, JSON.stringify(walletInfo, null, 2));
  
  console.log("\n💾 Wallet info saved to: new_deployer_wallet.json");
  console.log("\n⚠️  IMPORTANT: Keep this private key secure!");
  
  // Also update .env file
  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const updatedEnv = envContent.replace(
    /DEPLOYER_PRIVATE_KEY=.*/,
    `DEPLOYER_PRIVATE_KEY=${wallet.privateKey}`
  ).replace(
    /DEPLOYER_ADDRESS=.*/,
    `DEPLOYER_ADDRESS=${wallet.address}`
  );
  
  fs.writeFileSync(envPath, updatedEnv);
  console.log("\n✅ Updated .env file with new wallet credentials");
  
  return wallet;
}

const wallet = createNewWallet();

// Monitor balance
console.log("\n⏳ Waiting for funds...");
console.log("Run this command to check balance:");
console.log(`yarn tsx scripts/check_balance.ts ${wallet.address}`);