#!/usr/bin/env ts-node

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface WalletConfig {
  name: string;
  envKey: string;
  address?: string;
}

const WALLETS: WalletConfig[] = [
  { name: "user", envKey: "PRIVATE_KEY" },
  { name: "resolver0", envKey: "RESOLVER_PRIVATE_KEY_0" },
  { name: "resolver1", envKey: "RESOLVER_PRIVATE_KEY_1" },
  { name: "resolver2", envKey: "RESOLVER_PRIVATE_KEY_2" },
  { name: "relayer", envKey: "RELAYER_PRIVATE_KEY" },
];

// Default funding amount: 100 XLM (in stroops: 100 * 10^7)
const DEFAULT_FUND_AMOUNT = "1000000000"; // 100 XLM

async function getWalletAddresses(): Promise<WalletConfig[]> {
  console.log("[Fund] 📋 Getting wallet addresses...");
  
  // Use known addresses from our .env generation
  const walletsWithAddresses: WalletConfig[] = [
    { name: "user", envKey: "PRIVATE_KEY", address: "GCPX2LOXVXQZY7L253CKWPPP2RXSURJH7QNFIOH4SE4QJ3LXHMKZOY6Y" },
    { name: "resolver0", envKey: "RESOLVER_PRIVATE_KEY_0", address: "GBK2XMN3WGDMP7OR5NVUUUFPNMJEHJ5ZZ5M4ID2TKMWMUQXXEHXQUCUW" },
    { name: "resolver1", envKey: "RESOLVER_PRIVATE_KEY_1", address: "GDX647V42PWURCKVHWPLHB4SYWWP5F7CJ7IM5J5QOY2REOIEMWZSNMEN" },
    { name: "resolver2", envKey: "RESOLVER_PRIVATE_KEY_2", address: "GD4GJTZV6AEWSZPDAF6RWAGGED4XXAGTG6IS3JJEQ5VM3PQTF2F3G3TC" },
    { name: "relayer", envKey: "RELAYER_PRIVATE_KEY", address: "GBSRUI6EZUU3XG7HRXGYBLKYAWORQVGAACSA6TU6REQOHDZLZQ7TEHQE" },
  ];
  
  for (const wallet of walletsWithAddresses) {
    console.log(`[Fund] ✅ ${wallet.name}: ${wallet.address}`);
  }
  
  return walletsWithAddresses;
}

async function getDeployerInfo() {
  const deployerSecret = process.env.STELLAR_SECRET_KEY;
  
  if (!deployerSecret) {
    console.error("[Fund] ❌ STELLAR_SECRET_KEY not found in environment");
    process.exit(1);
  }
  
  // Use known deployer address
  const deployerAddress = "GBSRUI6EZUU3XG7HRXGYBLKYAWORQVGAACSA6TU6REQOHDZLZQ7TEHQE";
  
  return { address: deployerAddress, secret: deployerSecret };
}

async function createAccountWithFriendbot(address: string): Promise<boolean> {
  try {
    console.log(`[Fund] 🤖 Creating account with friendbot: ${address}`);
    
    const friendbotUrl = `https://friendbot.stellar.org?addr=${address}`;
    const result = execSync(`curl -s "${friendbotUrl}"`, {
      encoding: "utf-8"
    });
    
    if (result.includes('"successful":true') || result.includes('"status":"SUCCESS"')) {
      console.log(`[Fund] ✅ Account created via friendbot`);
      return true;
    } else {
      console.log(`[Fund] ⚠️  Friendbot response: ${result.substring(0, 100)}`);
      return false;
    }
  } catch (error: any) {
    console.error(`[Fund] ❌ Friendbot failed:`, error.message);
    return false;
  }
}

async function fundWallet(deployerSecret: string, recipient: string, amount: string): Promise<boolean> {
  try {
    console.log(`[Fund] ⚡ Funding ${recipient} with ${amount} stroops...`);
    
    // First check if account exists, if not create it with friendbot
    const checkResponse = execSync(`curl -s "https://horizon-testnet.stellar.org/accounts/${recipient}"`, {
      encoding: "utf-8"
    });
    
    if (!checkResponse.includes('"balance"')) {
      console.log(`[Fund] 📝 Account doesn't exist, creating with friendbot...`);
      const created = await createAccountWithFriendbot(recipient);
      if (!created) {
        return false;
      }
      // Wait a moment for account creation
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Use stellar tx new payment command for real funding
    // Amount is already in stroops which is what the CLI expects
    const paymentCommand = `stellar tx new payment \
      --source-account ${deployerSecret} \
      --destination ${recipient} \
      --amount ${amount} \
      --asset native \
      --rpc-url https://soroban-testnet.stellar.org \
      --network-passphrase "Test SDF Network ; September 2015"`;

    const result = execSync(paymentCommand, {
      encoding: "utf-8",
      stdio: "pipe"
    });
    
    // Extract transaction hash from output
    const lines = result.split('\n');
    const txHashLine = lines.find(line => line.includes('Transaction hash'));
    const txHash = txHashLine ? txHashLine.split(' ').pop() : 'unknown';
    
    console.log(`[Fund] ✅ Payment successful - TX: ${txHash}`);
    return true;
    
  } catch (error: any) {
    console.error(`[Fund] ❌ Failed to fund ${recipient}:`, error.message);
    return false;
  }
}

async function fundWallets() {
  console.log("[Fund] 💰 Starting wallet funding process...");
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const targets = args.find(arg => arg.startsWith("--targets="))?.split("=")[1] || "all";
  const amount = args.find(arg => arg.startsWith("--amount="))?.split("=")[1] || DEFAULT_FUND_AMOUNT;
  
  console.log(`[Fund] 🎯 Targets: ${targets}`);
  console.log(`[Fund] 💵 Amount: ${amount} stroops (${parseFloat(amount) / 10_000_000} XLM)`);

  try {
    // Step 1: Get deployer info
    const deployer = await getDeployerInfo();
    console.log(`[Fund] 🏦 Deployer: ${deployer.address}`);

    // Step 2: Get wallet addresses
    const wallets = await getWalletAddresses();
    
    if (wallets.length === 0) {
      console.error("[Fund] ❌ No valid wallets found");
      console.error("[Fund] Please set the following environment variables:");
      for (const wallet of WALLETS) {
        console.error(`[Fund]   ${wallet.envKey} (for ${wallet.name})`);
      }
      process.exit(1);
    }

    // Step 3: Filter targets
    let walletsToFund = wallets;
    if (targets !== "all") {
      const targetNames = targets.split(",").map(t => t.trim());
      walletsToFund = wallets.filter(w => targetNames.includes(w.name));
      
      if (walletsToFund.length === 0) {
        console.error(`[Fund] ❌ No valid targets found in: ${targets}`);
        console.error(`[Fund] Available targets: ${wallets.map(w => w.name).join(", ")}, all`);
        process.exit(1);
      }
    }

    console.log(`\n[Fund] 📊 Funding ${walletsToFund.length} wallets...`);

    // Step 4: Fund each wallet
    let successCount = 0;
    for (const wallet of walletsToFund) {
      if (!wallet.address) continue;
      
      console.log(`\n[Fund] 💸 Funding ${wallet.name}...`);
      console.log(`[Fund]   Address: ${wallet.address}`);
      console.log(`[Fund]   Amount: ${amount} stroops`);
      
      // Real XLM funding
      const success = await fundWallet(deployer.secret, wallet.address, amount);
      
      if (success) {
        console.log(`[Fund] ✅ ${wallet.name} funding initiated`);
        successCount++;
      } else {
        console.log(`[Fund] ❌ Failed to fund ${wallet.name}`);
      }
    }

    console.log(`\n[Fund] 🎉 Funding process completed!`);
    console.log(`[Fund] ✅ Successfully initiated funding for ${successCount}/${walletsToFund.length} wallets`);
    
    if (successCount < walletsToFund.length) {
      console.log(`[Fund] ⚠️  Some wallets require manual funding at:`);
      console.log(`[Fund]   https://laboratory.stellar.org/#account-creator?network=test`);
    }

    console.log(`\n[Fund] 📋 Wallet Summary:`);
    for (const wallet of walletsToFund) {
      console.log(`[Fund]   ${wallet.name}: ${wallet.address}`);
    }

  } catch (error) {
    console.error("[Fund] ❌ Funding failed:", error);
    process.exit(1);
  }
}

// Run funding
fundWallets().catch(error => {
  console.error("[Fund] ❌ Unexpected error:", error);
  process.exit(1);
});