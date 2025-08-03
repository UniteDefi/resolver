#!/usr/bin/env ts-node

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface DeploymentConfig {
  network: "testnet";
  rpcUrl: string;
  networkPassphrase: string;
  sourceSecret: string;
}

interface ContractAddresses {
  MockUSDT: string;
  MockDAI: string;
  UniteEscrow: string;
  UniteResolver: string;
  UniteEscrowFactory: string;
}

const CONFIG: DeploymentConfig = {
  network: "testnet",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  sourceSecret: process.env.STELLAR_SECRET_KEY || "",
};

async function checkDeployerBalance() {
  console.log("[Deploy] 🔍 Checking deployer wallet balance...");
  
  if (!CONFIG.sourceSecret) {
    console.error("[Deploy] ❌ STELLAR_SECRET_KEY not found in environment");
    console.error("[Deploy] Please set STELLAR_SECRET_KEY in your .env file");
    process.exit(1);
  }

  // Known deployer address
  const deployerAddress = "GBSRUI6EZUU3XG7HRXGYBLKYAWORQVGAACSA6TU6REQOHDZLZQ7TEHQE";
  console.log(`[Deploy] 💰 Deployer address: ${deployerAddress}`);
  
  try {
    // Check account exists and balance via API
    const response = execSync(`curl -s "https://horizon-testnet.stellar.org/accounts/${deployerAddress}"`, {
      encoding: "utf-8"
    });
    
    if (response.includes('"balance"')) {
      // Extract balance for display
      const balanceMatch = response.match(/"balance":\s*"(\d+\.\d+)"/);
      const balance = balanceMatch ? balanceMatch[1] : "unknown";
      console.log(`[Deploy] ✅ Account funded with ${balance} XLM`);
    } else {
      console.error("[Deploy] ❌ Account not found or not funded");
      console.error("[Deploy] Please fund your wallet at: https://laboratory.stellar.org/#account-creator?network=test");
      console.error(`[Deploy] Address: ${deployerAddress}`);
      process.exit(1);
    }
    
    return deployerAddress;
  } catch (error) {
    console.error("[Deploy] ❌ Failed to verify deployer:", error);
    console.error("[Deploy] Please fund your wallet at: https://laboratory.stellar.org/#account-creator?network=test");
    process.exit(1);
  }
}

async function buildContracts() {
  console.log("[Deploy] 🔨 Building contracts...");
  
  try {
    execSync("cargo build --target wasm32-unknown-unknown --release", {
      cwd: join(__dirname, ".."),
      stdio: "inherit",
    });

    const wasmPath = join(__dirname, "..", "target", "wasm32-unknown-unknown", "release", "unite_stellar.wasm");
    
    if (!existsSync(wasmPath)) {
      console.error("[Deploy] ❌ WASM file not found at expected path");
      console.error("[Deploy] Expected:", wasmPath);
      
      const altPath = join(__dirname, "..", "target", "wasm32-unknown-unknown", "release", "unite-stellar.wasm");
      if (existsSync(altPath)) {
        console.log("[Deploy] ✅ Found WASM at alternative path");
        return altPath;
      }
      
      console.error("[Deploy] ❌ Cannot find WASM file");
      process.exit(1);
    }

    const wasmSize = readFileSync(wasmPath).length;
    console.log(`[Deploy] ✅ Contracts built successfully. Size: ${(wasmSize / 1024).toFixed(1)} KB`);
    
    return wasmPath;
  } catch (error) {
    console.error("[Deploy] ❌ Failed to build contracts:", error);
    process.exit(1);
  }
}

async function deployContract(wasmPath: string, contractName: string): Promise<string> {
  console.log(`[Deploy] 🚀 Deploying ${contractName}...`);
  
  try {
    const deployCommand = `stellar contract deploy \
      --wasm ${wasmPath} \
      --source ${CONFIG.sourceSecret} \
      --rpc-url ${CONFIG.rpcUrl} \
      --network-passphrase "${CONFIG.networkPassphrase}"`;

    const contractId = execSync(deployCommand, {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
    }).trim();

    console.log(`[Deploy] ✅ ${contractName}: ${contractId}`);
    
    return contractId;
  } catch (error) {
    console.error(`[Deploy] ❌ Failed to deploy ${contractName}:`, error);
    throw error;
  }
}

async function initializeContract(contractId: string, adminAddress: string, decimal: number, name: string, symbol: string): Promise<void> {
  console.log(`[Deploy] 🔧 Initializing ${symbol}...`);
  
  try {
    const initCommand = `stellar contract invoke \
      --source ${CONFIG.sourceSecret} \
      --rpc-url ${CONFIG.rpcUrl} \
      --network-passphrase "${CONFIG.networkPassphrase}" \
      --id ${contractId} \
      -- \
      init \
      --admin ${adminAddress} \
      --decimal ${decimal} \
      --name "${name}" \
      --symbol "${symbol}"`;

    execSync(initCommand, {
      cwd: join(__dirname, ".."),
      stdio: "pipe",
    });

    console.log(`[Deploy] ✅ ${symbol} initialized with ${decimal} decimals`);
  } catch (error) {
    console.error(`[Deploy] ❌ Failed to initialize ${symbol}:`, error);
    throw error;
  }
}

async function deployAllContracts() {
  console.log("[Deploy] 🌟 Starting Unite DeFi Stellar deployment...");

  try {
    // Step 1: Check deployer balance
    const deployerAddress = await checkDeployerBalance();

    // Step 2: Build contracts
    const wasmPath = await buildContracts();

    // Step 3: Deploy all contract instances
    console.log("\n[Deploy] 📋 Deploying all contracts...");
    const contracts: ContractAddresses = {
      MockUSDT: await deployContract(wasmPath, "MockUSDT"),
      MockDAI: await deployContract(wasmPath, "MockDAI"), 
      UniteEscrow: await deployContract(wasmPath, "UniteEscrow"),
      UniteResolver: await deployContract(wasmPath, "UniteResolver"),
      UniteEscrowFactory: await deployContract(wasmPath, "UniteEscrowFactory"),
    };

    // Step 4: Initialize tokens with 6 decimals
    console.log("\n[Deploy] 🔧 Initializing tokens...");
    await initializeContract(contracts.MockUSDT, deployerAddress, 6, "Mock USDT", "USDT");
    await initializeContract(contracts.MockDAI, deployerAddress, 6, "Mock DAI", "DAI");

    // Step 5: Save deployment info
    const deploymentInfo = {
      stellar: {
        chainId: "stellar-testnet",
        name: "Stellar Testnet",
        deployerAddress,
        deployedAt: new Date().toISOString(),
        ...contracts,
      }
    };

    const deploymentPath = join(__dirname, "..", "deployments.json");
    
    // Merge with existing deployments if they exist
    let existingDeployments = {};
    if (existsSync(deploymentPath)) {
      try {
        existingDeployments = JSON.parse(readFileSync(deploymentPath, "utf-8"));
      } catch (error) {
        console.log("[Deploy] ⚠️  Could not read existing deployments, creating new file");
      }
    }

    const finalDeployments = { ...existingDeployments, ...deploymentInfo };
    writeFileSync(deploymentPath, JSON.stringify(finalDeployments, null, 2));

    console.log(`\n[Deploy] 💾 Deployment info saved to ${deploymentPath}`);

    // Step 5: Display summary
    console.log("\n[Deploy] 🎉 Deployment completed successfully!");
    console.log("\n=== DEPLOYED CONTRACTS ===");
    for (const [name, address] of Object.entries(contracts)) {
      console.log(`${name}: ${address}`);
    }

    console.log(`\n=== COPY TO DEPLOYMENTS.JSON ===`);
    console.log(`"stellar": {`);
    console.log(`  "chainId": "stellar-testnet",`);
    console.log(`  "name": "Stellar Testnet",`);
    console.log(`  "deployerAddress": "${deployerAddress}",`);
    for (const [name, address] of Object.entries(contracts)) {
      console.log(`  "${name}": "${address}",`);
    }
    console.log(`}`);

    console.log(`\n=== NEXT STEPS ===`);
    console.log(`1. Run: npm run fund-wallets`);
    console.log(`2. Run: npm run mint-tokens`);
    console.log(`3. Run: npm run test:swap`);

    return contracts;

  } catch (error) {
    console.error("[Deploy] ❌ Deployment failed:", error);
    process.exit(1);
  }
}

// Run deployment
deployAllContracts().catch(error => {
  console.error("[Deploy] ❌ Unexpected error:", error);
  process.exit(1);
});