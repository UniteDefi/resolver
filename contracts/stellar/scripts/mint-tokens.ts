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

interface TokenAddresses {
  MockUSDT?: string;
  MockDAI?: string;
}

const WALLETS: WalletConfig[] = [
  { name: "user", envKey: "PRIVATE_KEY" },
  { name: "resolver0", envKey: "RESOLVER_PRIVATE_KEY_0" },
  { name: "resolver1", envKey: "RESOLVER_PRIVATE_KEY_1" },
  { name: "resolver2", envKey: "RESOLVER_PRIVATE_KEY_2" },
  { name: "relayer", envKey: "RELAYER_PRIVATE_KEY" },
];

// Default mint amounts (6 decimals for both USDT and DAI)
const DEFAULT_USDT_AMOUNT = "10000000000"; // 10,000 USDT (10,000 * 10^6)
const DEFAULT_DAI_AMOUNT = "10000000000";  // 10,000 DAI (10,000 * 10^6)

async function getWalletAddresses(): Promise<WalletConfig[]> {
  console.log("[Mint] 📋 Getting wallet addresses...");
  
  // Use known addresses from our .env generation
  const walletsWithAddresses: WalletConfig[] = [
    { name: "user", envKey: "PRIVATE_KEY", address: "GCPX2LOXVXQZY7L253CKWPPP2RXSURJH7QNFIOH4SE4QJ3LXHMKZOY6Y" },
    { name: "resolver0", envKey: "RESOLVER_PRIVATE_KEY_0", address: "GBK2XMN3WGDMP7OR5NVUUUFPNMJEHJ5ZZ5M4ID2TKMWMUQXXEHXQUCUW" },
    { name: "resolver1", envKey: "RESOLVER_PRIVATE_KEY_1", address: "GDX647V42PWURCKVHWPLHB4SYWWP5F7CJ7IM5J5QOY2REOIEMWZSNMEN" },
    { name: "resolver2", envKey: "RESOLVER_PRIVATE_KEY_2", address: "GD4GJTZV6AEWSZPDAF6RWAGGED4XXAGTG6IS3JJEQ5VM3PQTF2F3G3TC" },
    { name: "relayer", envKey: "RELAYER_PRIVATE_KEY", address: "GBSRUI6EZUU3XG7HRXGYBLKYAWORQVGAACSA6TU6REQOHDZLZQ7TEHQE" },
  ];
  
  for (const wallet of walletsWithAddresses) {
    console.log(`[Mint] ✅ ${wallet.name}: ${wallet.address}`);
  }
  
  return walletsWithAddresses;
}

async function getDeployerInfo() {
  const deployerSecret = process.env.STELLAR_SECRET_KEY;
  
  if (!deployerSecret) {
    console.error("[Mint] ❌ STELLAR_SECRET_KEY not found in environment");
    process.exit(1);
  }
  
  // Use known deployer address
  const deployerAddress = "GBSRUI6EZUU3XG7HRXGYBLKYAWORQVGAACSA6TU6REQOHDZLZQ7TEHQE";
  
  return { address: deployerAddress, secret: deployerSecret };
}

async function getTokenAddresses(): Promise<TokenAddresses> {
  console.log("[Mint] 📖 Reading token addresses from deployments.json...");
  
  try {
    const deploymentPath = join(__dirname, "..", "deployments.json");
    const deploymentData = JSON.parse(readFileSync(deploymentPath, "utf-8"));
    
    const stellarDeployment = deploymentData.stellar;
    if (!stellarDeployment) {
      console.error("[Mint] ❌ Stellar deployment not found in deployments.json");
      console.error("[Mint] Please run 'npm run deploy' first");
      process.exit(1);
    }
    
    const tokens: TokenAddresses = {
      MockUSDT: stellarDeployment.MockUSDT,
      MockDAI: stellarDeployment.MockDAI,
    };
    
    console.log("[Mint] ✅ Token addresses loaded:");
    console.log(`[Mint]   MockUSDT: ${tokens.MockUSDT || "Not found"}`);
    console.log(`[Mint]   MockDAI: ${tokens.MockDAI || "Not found"}`);
    
    return tokens;
  } catch (error) {
    console.error("[Mint] ❌ Failed to read deployments.json:", error);
    console.error("[Mint] Please run 'npm run deploy' first");
    process.exit(1);
  }
}

async function mintTokenToWallet(
  deployerSecret: string,
  contractId: string,
  recipientAddress: string,
  amount: string,
  tokenName: string
): Promise<boolean> {
  try {
    console.log(`[Mint] ⚡ Minting ${tokenName} to ${recipientAddress}...`);
    
    // Invoke the mint function on the token contract
    const mintCommand = `stellar contract invoke \
      --source ${deployerSecret} \
      --rpc-url https://soroban-testnet.stellar.org \
      --network-passphrase "Test SDF Network ; September 2015" \
      --id ${contractId} \
      -- \
      mint \
      --to ${recipientAddress} \
      --amount ${amount}`;

    execSync(mintCommand, {
      stdio: "pipe",
      cwd: join(__dirname, "..")
    });
    
    console.log(`[Mint] ✅ Successfully minted ${amount} ${tokenName} to ${recipientAddress}`);
    return true;
    
  } catch (error) {
    console.error(`[Mint] ❌ Failed to mint ${tokenName} to ${recipientAddress}:`, error);
    return false;
  }
}

async function mintTokens() {
  console.log("[Mint] 🪙 Starting token minting process...");
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const targets = args.find(arg => arg.startsWith("--targets="))?.split("=")[1] || "all";
  const usdtAmount = args.find(arg => arg.startsWith("--usdt-amount="))?.split("=")[1] || DEFAULT_USDT_AMOUNT;
  const daiAmount = args.find(arg => arg.startsWith("--dai-amount="))?.split("=")[1] || DEFAULT_DAI_AMOUNT;
  
  console.log(`[Mint] 🎯 Targets: ${targets}`);
  console.log(`[Mint] 💵 USDT Amount: ${usdtAmount} units (${parseFloat(usdtAmount) / 1_000_000} USDT)`);
  console.log(`[Mint] 💵 DAI Amount: ${daiAmount} units (${parseFloat(daiAmount) / 1_000_000} DAI)`);

  try {
    // Step 1: Get deployer info
    const deployer = await getDeployerInfo();
    console.log(`[Mint] 🏦 Deployer: ${deployer.address}`);

    // Step 2: Get token addresses
    const tokens = await getTokenAddresses();

    // Step 3: Get wallet addresses
    const wallets = await getWalletAddresses();
    
    if (wallets.length === 0) {
      console.error("[Mint] ❌ No valid wallets found");
      console.error("[Mint] Please set the following environment variables:");
      for (const wallet of WALLETS) {
        console.error(`[Mint]   ${wallet.envKey} (for ${wallet.name})`);
      }
      process.exit(1);
    }

    // Step 4: Filter targets
    let walletsToMint = wallets;
    if (targets !== "all") {
      const targetNames = targets.split(",").map(t => t.trim());
      walletsToMint = wallets.filter(w => targetNames.includes(w.name));
      
      if (walletsToMint.length === 0) {
        console.error(`[Mint] ❌ No valid targets found in: ${targets}`);
        console.error(`[Mint] Available targets: ${wallets.map(w => w.name).join(", ")}, all`);
        process.exit(1);
      }
    }

    console.log(`\n[Mint] 📊 Minting tokens to ${walletsToMint.length} wallets...`);

    // Step 5: Mint tokens to each wallet
    let usdtSuccessCount = 0;
    let daiSuccessCount = 0;

    for (const wallet of walletsToMint) {
      if (!wallet.address) continue;
      
      console.log(`\n[Mint] 💰 Processing ${wallet.name}...`);
      console.log(`[Mint]   Address: ${wallet.address}`);
      
      // Mint USDT
      if (tokens.MockUSDT) {
        const success = await mintTokenToWallet(
          deployer.secret,
          tokens.MockUSDT,
          wallet.address,
          usdtAmount,
          "USDT"
        );
        if (success) usdtSuccessCount++;
      } else {
        console.log(`[Mint] ⚠️  Skipping USDT for ${wallet.name} - MockUSDT contract not found`);
      }
      
      // Mint DAI
      if (tokens.MockDAI) {
        const success = await mintTokenToWallet(
          deployer.secret,
          tokens.MockDAI,
          wallet.address,
          daiAmount,
          "DAI"
        );
        if (success) daiSuccessCount++;
      } else {
        console.log(`[Mint] ⚠️  Skipping DAI for ${wallet.name} - MockDAI contract not found`);
      }
    }

    console.log(`\n[Mint] 🎉 Token minting process completed!`);
    console.log(`[Mint] ✅ USDT minted to ${usdtSuccessCount}/${walletsToMint.length} wallets`);
    console.log(`[Mint] ✅ DAI minted to ${daiSuccessCount}/${walletsToMint.length} wallets`);
    
    console.log(`\n[Mint] 📋 Summary:`);
    console.log(`[Mint] All wallets received:`);
    console.log(`[Mint] - ${parseFloat(usdtAmount) / 1_000_000} USDT`);
    console.log(`[Mint] - ${parseFloat(daiAmount) / 1_000_000} DAI`);

    console.log(`\n[Mint] 📊 Wallet Details:`)
    for (const wallet of walletsToMint) {
      console.log(`[Mint]   ${wallet.name}: ${wallet.address}`);
    }

    console.log(`\n[Mint] 🚀 Next Steps:`);
    console.log(`[Mint] 1. Run: npm run test:swap`);
    console.log(`[Mint] 2. Verify token balances in Stellar Laboratory`);

  } catch (error) {
    console.error("[Mint] ❌ Minting failed:", error);
    process.exit(1);
  }
}

// Run minting
mintTokens().catch(error => {
  console.error("[Mint] ❌ Unexpected error:", error);
  process.exit(1);
});