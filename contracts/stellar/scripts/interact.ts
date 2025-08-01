#!/usr/bin/env ts-node

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface InteractionConfig {
  contractId: string;
  network: string;
  rpcUrl: string;
  networkPassphrase: string;
  sourceSecret: string;
}

function loadDeploymentInfo(network: string): { contractId: string } {
  const deploymentPath = join(__dirname, "..", `deployment-${network}.json`);
  try {
    const deploymentData = JSON.parse(readFileSync(deploymentPath, "utf-8"));
    return deploymentData;
  } catch (error) {
    console.error(`[Interact] Could not load deployment info for ${network}`);
    console.error(`[Interact] Make sure you've deployed the contract first`);
    process.exit(1);
  }
}

const NETWORK_CONFIGS: Record<string, { rpcUrl: string; networkPassphrase: string }> = {
  local: {
    rpcUrl: "http://localhost:8000/soroban/rpc",
    networkPassphrase: "Standalone Network ; February 2017",
  },
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    rpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
};

function executeCommand(config: InteractionConfig, method: string, ...args: string[]): string {
  const argsString = args.length > 0 ? `--${args.join(" --")}` : "";
  const command = `stellar contract invoke \
    --id ${config.contractId} \
    --source ${config.sourceSecret} \
    --rpc-url ${config.rpcUrl} \
    --network-passphrase "${config.networkPassphrase}" \
    -- \
    ${method} ${argsString}`;

  try {
    const result = execSync(command, {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
    }).trim();
    // Extract just the value from the output (first line)
    return result.split("\n")[0];
  } catch (error: any) {
    console.error(`[Interact] Failed to execute ${method}:`, error.message);
    throw error;
  }
}

async function interact() {
  console.log("[Interact] Starting contract interaction...");

  // Parse command line arguments
  const args = process.argv.slice(2);
  const networkArg = args.find(arg => arg.startsWith("--network="))?.split("=")[1] || "testnet";
  const actionArg = args.find(arg => arg.startsWith("--action="))?.split("=")[1] || "get_count";

  if (!NETWORK_CONFIGS[networkArg]) {
    console.error(`[Interact] Invalid network: ${networkArg}. Use local, testnet, or mainnet.`);
    process.exit(1);
  }

  const deploymentInfo = loadDeploymentInfo(networkArg);
  const config: InteractionConfig = {
    contractId: deploymentInfo.contractId,
    network: networkArg,
    ...NETWORK_CONFIGS[networkArg],
    sourceSecret: process.env.STELLAR_SECRET_KEY || "",
  };

  if (!config.sourceSecret) {
    console.error("[Interact] STELLAR_SECRET_KEY not found in environment variables");
    console.error("[Interact] Please set STELLAR_SECRET_KEY in your .env file");
    process.exit(1);
  }

  console.log(`[Interact] Network: ${config.network}`);
  console.log(`[Interact] Contract ID: ${config.contractId}`);
  console.log(`[Interact] Action: ${actionArg}`);

  try {
    switch (actionArg) {
      case "get_count":
        const count = executeCommand(config, "get_count");
        console.log(`[Interact] Current count: ${count}`);
        break;

      case "increment":
        const newCountInc = executeCommand(config, "increment");
        console.log(`[Interact] Count after increment: ${newCountInc}`);
        break;

      case "decrement":
        const newCountDec = executeCommand(config, "decrement");
        console.log(`[Interact] Count after decrement: ${newCountDec}`);
        break;

      case "demo":
        console.log("[Interact] Running demo sequence...");
        
        console.log("[Interact] Initial count:", executeCommand(config, "get_count"));
        
        console.log("[Interact] Incrementing 3 times...");
        for (let i = 0; i < 3; i++) {
          const result = executeCommand(config, "increment");
          console.log(`[Interact] Count after increment ${i + 1}: ${result}`);
        }
        
        console.log("[Interact] Decrementing once...");
        console.log("[Interact] Count after decrement:", executeCommand(config, "decrement"));
        
        console.log("[Interact] Final count:", executeCommand(config, "get_count"));
        break;

      default:
        console.error(`[Interact] Unknown action: ${actionArg}`);
        console.log("[Interact] Available actions: get_count, increment, decrement, demo");
        process.exit(1);
    }

    console.log("[Interact] Interaction completed successfully!");

  } catch (error) {
    console.error("[Interact] Interaction failed:", error);
    process.exit(1);
  }
}

// Show usage
if (process.argv.includes("--help")) {
  console.log(`
Usage: yarn ts-node scripts/interact.ts [options]

Options:
  --network=<network>  Network to use (local, testnet, mainnet). Default: testnet
  --action=<action>    Action to perform. Default: get_count
  
Available actions:
  get_count   - Get the current counter value
  increment   - Increment the counter
  decrement   - Decrement the counter
  demo        - Run a demonstration sequence

Examples:
  yarn ts-node scripts/interact.ts --network=testnet --action=get_count
  yarn ts-node scripts/interact.ts --network=local --action=increment
  yarn ts-node scripts/interact.ts --network=testnet --action=demo
`);
  process.exit(0);
}

// Run interaction
interact().catch(error => {
  console.error("[Interact] Unexpected error:", error);
  process.exit(1);
});