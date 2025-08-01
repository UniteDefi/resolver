#!/usr/bin/env ts-node

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface DeploymentConfig {
  network: "local" | "testnet" | "mainnet";
  rpcUrl: string;
  networkPassphrase: string;
  sourceSecret: string;
}

const NETWORK_CONFIGS: Record<string, Omit<DeploymentConfig, "sourceSecret">> = {
  local: {
    network: "local",
    rpcUrl: "http://localhost:8000/soroban/rpc",
    networkPassphrase: "Standalone Network ; February 2017",
  },
  testnet: {
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    network: "mainnet",
    rpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
};

async function deploy() {
  console.log("[Deploy] Starting deployment process...");

  // Parse command line arguments
  const args = process.argv.slice(2);
  const networkArg = args.find(arg => arg.startsWith("--network="))?.split("=")[1] || "testnet";
  
  if (!NETWORK_CONFIGS[networkArg]) {
    console.error(`[Deploy] Invalid network: ${networkArg}. Use local, testnet, or mainnet.`);
    process.exit(1);
  }

  const config: DeploymentConfig = {
    ...NETWORK_CONFIGS[networkArg],
    sourceSecret: process.env.STELLAR_SECRET_KEY || "",
  };

  if (!config.sourceSecret) {
    console.error("[Deploy] STELLAR_SECRET_KEY not found in environment variables");
    console.error("[Deploy] Please set STELLAR_SECRET_KEY in your .env file");
    process.exit(1);
  }

  console.log(`[Deploy] Deploying to ${config.network}`);
  console.log(`[Deploy] RPC URL: ${config.rpcUrl}`);

  try {
    // Step 1: Build the contract
    console.log("[Deploy] Building contract...");
    execSync("cargo build --target wasm32-unknown-unknown --release", {
      cwd: join(__dirname, ".."),
      stdio: "inherit",
    });

    const wasmPath = join(__dirname, "..", "target", "wasm32-unknown-unknown", "release", "counter.wasm");
    const wasmSize = readFileSync(wasmPath).length;
    console.log(`[Deploy] Contract built successfully. Size: ${wasmSize} bytes`);

    // Step 2: Optimize the contract
    console.log("[Deploy] Optimizing contract...");
    try {
      execSync(`stellar contract optimize --wasm ${wasmPath}`, {
        cwd: join(__dirname, ".."),
        stdio: "inherit",
      });
      console.log("[Deploy] Contract optimized successfully");
    } catch (error) {
      console.log("[Deploy] Warning: Could not optimize contract (stellar CLI might not be installed)");
    }

    // Step 3: Deploy the contract
    console.log("[Deploy] Deploying contract...");
    const deployCommand = `stellar contract deploy \
      --wasm ${wasmPath} \
      --source ${config.sourceSecret} \
      --rpc-url ${config.rpcUrl} \
      --network-passphrase "${config.networkPassphrase}"`;

    console.log("[Deploy] Executing deployment command...");
    const deployOutput = execSync(deployCommand, {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
    }).trim();

    console.log(`[Deploy] Contract deployed successfully!`);
    console.log(`[Deploy] Contract ID: ${deployOutput}`);

    // Step 4: Save deployment information
    const deploymentInfo = {
      contractId: deployOutput,
      network: config.network,
      deployedAt: new Date().toISOString(),
      wasmHash: execSync(`sha256sum ${wasmPath}`, { encoding: "utf-8" }).split(" ")[0],
    };

    const deploymentPath = join(__dirname, "..", `deployment-${config.network}.json`);
    writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`[Deploy] Deployment info saved to ${deploymentPath}`);

    // Step 5: Test the deployment
    console.log("[Deploy] Testing deployment...");
    const testCommands = [
      {
        name: "get_count",
        command: `stellar contract invoke \
          --id ${deployOutput} \
          --source ${config.sourceSecret} \
          --rpc-url ${config.rpcUrl} \
          --network-passphrase "${config.networkPassphrase}" \
          -- \
          get_count`,
      },
      {
        name: "increment",
        command: `stellar contract invoke \
          --id ${deployOutput} \
          --source ${config.sourceSecret} \
          --rpc-url ${config.rpcUrl} \
          --network-passphrase "${config.networkPassphrase}" \
          -- \
          increment`,
      },
    ];

    for (const test of testCommands) {
      try {
        console.log(`[Deploy] Testing ${test.name}...`);
        const result = execSync(test.command, {
          cwd: join(__dirname, ".."),
          encoding: "utf-8",
        }).trim();
        console.log(`[Deploy] ${test.name} result: ${result}`);
      } catch (error) {
        console.error(`[Deploy] Failed to test ${test.name}:`, error);
      }
    }

    console.log("[Deploy] Deployment completed successfully!");

  } catch (error) {
    console.error("[Deploy] Deployment failed:", error);
    process.exit(1);
  }
}

// Run deployment
deploy().catch(error => {
  console.error("[Deploy] Unexpected error:", error);
  process.exit(1);
});