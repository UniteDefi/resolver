#!/usr/bin/env ts-node

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface DeploymentInfo {
  network: string;
  deployedAt: string;
  contracts: Record<string, string>;
  wasmHash: string;
}

interface TokenConfig {
  name: string;
  symbol: string;
  decimals: number;
  supply: string; // In base units
}

interface WalletConfig {
  name: string;
  secretKey: string;
  address?: string;
}

const TOKENS: TokenConfig[] = [
  {
    name: "Mock USDT",
    symbol: "MUSDT", 
    decimals: 7, // Stellar uses 7 decimals
    supply: "1000000000000000", // 100M USDT with 7 decimals
  },
  {
    name: "Mock DAI",
    symbol: "MDAI",
    decimals: 7,
    supply: "1000000000000000", // 100M DAI with 7 decimals
  }
];

const WALLETS: WalletConfig[] = [
  {
    name: "deployer",
    secretKey: process.env.STELLAR_SECRET_KEY || "",
  },
  {
    name: "user",
    secretKey: process.env.USER_PRIVATE_KEY || "",
  },
  {
    name: "resolver1", 
    secretKey: process.env.RESOLVER_PRIVATE_KEY_0 || "",
  },
  {
    name: "resolver2",
    secretKey: process.env.RESOLVER_PRIVATE_KEY_1 || "",
  },
  {
    name: "resolver3",
    secretKey: process.env.RESOLVER_PRIVATE_KEY_2 || "",
  }
];

async function loadDeploymentInfo(): Promise<DeploymentInfo> {
  const deploymentPath = join(__dirname, "..", "deployment-unite-testnet.json");
  
  try {
    const deploymentData = readFileSync(deploymentPath, "utf-8");
    return JSON.parse(deploymentData);
  } catch (error) {
    console.error("[Setup] ❌ Could not load deployment info from", deploymentPath);
    console.error("[Setup] Please run deploy-unite.ts first");
    process.exit(1);
  }
}

async function generateWalletAddresses(): Promise<WalletConfig[]> {
  console.log("[Setup] Generating wallet addresses...");
  
  const walletsWithAddresses: WalletConfig[] = [];
  
  for (const wallet of WALLETS) {
    if (!wallet.secretKey) {
      console.log(`[Setup] ⚠️  Skipping ${wallet.name} - no secret key provided`);
      continue;
    }
    
    try {
      // Generate temporary key name
      const tempKeyName = `temp_${wallet.name}_${Date.now()}`;
      
      // Add the key temporarily
      execSync(`echo "${wallet.secretKey}" | stellar keys add ${tempKeyName} --secret-key`, {
        stdio: "pipe"
      });

      // Get the address
      const address = execSync(`stellar keys address ${tempKeyName}`, {
        encoding: "utf-8"
      }).trim();

      walletsWithAddresses.push({
        ...wallet,
        address
      });

      console.log(`[Setup] ✅ ${wallet.name}: ${address}`);

      // Clean up temporary key
      execSync(`stellar keys rm ${tempKeyName}`, { stdio: "pipe" });
      
    } catch (error) {
      console.error(`[Setup] ❌ Failed to get address for ${wallet.name}:`, error);
    }
  }
  
  return walletsWithAddresses;
}

async function deployToken(deployment: DeploymentInfo, token: TokenConfig, adminWallet: WalletConfig): Promise<string> {
  console.log(`[Setup] Deploying ${token.symbol} token...`);
  
  const rpcUrl = "https://soroban-testnet.stellar.org";
  const networkPassphrase = "Test SDF Network ; September 2015";
  
  try {
    // Deploy a new instance of the MockToken contract
    const tokenContractId = deployment.contracts.MockToken;
    
    if (!tokenContractId) {
      console.error("[Setup] ❌ MockToken contract not found in deployment");
      process.exit(1);
    }

    // Initialize the token
    const initCommand = `stellar contract invoke \
      --id ${tokenContractId} \
      --source ${adminWallet.secretKey} \
      --rpc-url ${rpcUrl} \
      --network-passphrase "${networkPassphrase}" \
      -- \
      init \
      --admin ${adminWallet.address} \
      --decimal ${token.decimals} \
      --name "${token.name}" \
      --symbol "${token.symbol}"`;

    execSync(initCommand, {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
    });

    console.log(`[Setup] ✅ ${token.symbol} initialized successfully`);
    return tokenContractId;
    
  } catch (error) {
    console.error(`[Setup] ❌ Failed to deploy ${token.symbol}:`, error);
    throw error;
  }
}

async function mintTokens(tokenId: string, token: TokenConfig, recipient: WalletConfig, amount: string): Promise<void> {
  console.log(`[Setup] Minting ${amount} ${token.symbol} to ${recipient.name}...`);
  
  const rpcUrl = "https://soroban-testnet.stellar.org";
  const networkPassphrase = "Test SDF Network ; September 2015";
  const adminSecret = process.env.STELLAR_SECRET_KEY;
  
  try {
    const mintCommand = `stellar contract invoke \
      --id ${tokenId} \
      --source ${adminSecret} \
      --rpc-url ${rpcUrl} \
      --network-passphrase "${networkPassphrase}" \
      -- \
      mint \
      --to ${recipient.address} \
      --amount ${amount}`;

    execSync(mintCommand, {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
    });

    console.log(`[Setup] ✅ Minted ${amount} ${token.symbol} to ${recipient.name}`);
    
  } catch (error) {
    console.error(`[Setup] ❌ Failed to mint ${token.symbol} to ${recipient.name}:`, error);
  }
}

async function checkTokenBalance(tokenId: string, wallet: WalletConfig, tokenSymbol: string): Promise<string> {
  const rpcUrl = "https://soroban-testnet.stellar.org";
  const networkPassphrase = "Test SDF Network ; September 2015";
  
  try {
    const balanceCommand = `stellar contract invoke \
      --id ${tokenId} \
      --source ${wallet.secretKey} \
      --rpc-url ${rpcUrl} \
      --network-passphrase "${networkPassphrase}" \
      -- \
      balance \
      --id ${wallet.address}`;

    const balance = execSync(balanceCommand, {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
    }).trim();

    return balance;
    
  } catch (error) {
    console.error(`[Setup] ❌ Failed to check ${tokenSymbol} balance for ${wallet.name}:`, error);
    return "0";
  }
}

async function fundResolverWallets(wallets: WalletConfig[]): Promise<void> {
  console.log("[Setup] Funding resolver wallets with native XLM...");
  
  // In a real implementation, this would transfer XLM for safety deposits
  // For now, we'll just log what should be done
  const resolverWallets = wallets.filter(w => w.name.startsWith("resolver"));
  
  for (const wallet of resolverWallets) {
    console.log(`[Setup] ⚠️  Manual action required: Fund ${wallet.name} (${wallet.address}) with XLM for safety deposits`);
    console.log(`[Setup] You can fund it at: https://laboratory.stellar.org/#account-creator?network=test`);
  }
}

async function setup() {
  console.log("[Setup] 🪙 Setting up tokens and funding wallets...");

  try {
    // Step 1: Load deployment info
    const deployment = await loadDeploymentInfo();
    console.log(`[Setup] Loaded deployment for network: ${deployment.network}`);

    // Step 2: Generate wallet addresses
    const wallets = await generateWalletAddresses();
    
    if (wallets.length === 0) {
      console.error("[Setup] ❌ No valid wallets found");
      process.exit(1);
    }

    const adminWallet = wallets.find(w => w.name === "deployer");
    if (!adminWallet) {
      console.error("[Setup] ❌ Deployer wallet not found");
      process.exit(1);
    }

    // Step 3: Deploy and setup tokens
    const deployedTokens: Record<string, string> = {};
    
    for (const token of TOKENS) {
      const tokenId = await deployToken(deployment, token, adminWallet);
      deployedTokens[token.symbol] = tokenId;
      
      // Mint tokens to user and resolvers
      const mintAmount = "10000000000"; // 1000 tokens with 7 decimals
      
      for (const wallet of wallets.filter(w => w.name !== "deployer")) {
        await mintTokens(tokenId, token, wallet, mintAmount);
      }
      
      // Add delay between tokens
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Step 4: Fund resolver wallets with native XLM  
    await fundResolverWallets(wallets);

    // Step 5: Check balances
    console.log("\n[Setup] 📊 Token Balances:");
    for (const [symbol, tokenId] of Object.entries(deployedTokens)) {
      console.log(`\n--- ${symbol} ---`);
      for (const wallet of wallets) {
        const balance = await checkTokenBalance(tokenId, wallet, symbol);
        console.log(`${wallet.name}: ${balance}`);
      }
    }

    console.log("\n[Setup] 🎉 Token setup completed successfully!");
    console.log("\n=== DEPLOYED TOKENS ===");
    for (const [symbol, id] of Object.entries(deployedTokens)) {
      console.log(`${symbol}: ${id}`);
    }
    
    console.log(`\n=== WALLET ADDRESSES ===`);
    for (const wallet of wallets) {
      console.log(`${wallet.name}: ${wallet.address}`);
    }

  } catch (error) {
    console.error("[Setup] ❌ Token setup failed:", error);
    process.exit(1);
  }
}

// Run setup
setup().catch(error => {
  console.error("[Setup] ❌ Unexpected error:", error);
  process.exit(1);
});