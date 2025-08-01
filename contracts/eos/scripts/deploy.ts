import { Api, JsonRpc } from "eosjs";
import { JsSignatureProvider } from "eosjs/dist/eosjs-jssig";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

interface DeployConfig {
  rpcEndpoint: string;
  contractAccount: string;
  contractPrivateKey: string;
  wasmPath: string;
  abiPath: string;
}

async function deployContract(config: DeployConfig): Promise<void> {
  console.log("[Deploy] Starting deployment process...");
  console.log("[Deploy] RPC Endpoint:", config.rpcEndpoint);
  console.log("[Deploy] Contract Account:", config.contractAccount);

  // Initialize EOSJS
  const rpc = new JsonRpc(config.rpcEndpoint, { fetch: fetch as any });
  const signatureProvider = new JsSignatureProvider([config.contractPrivateKey]);
  
  const api = new Api({
    rpc,
    signatureProvider,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder()
  });

  try {
    // Read WASM and ABI files
    const wasm = fs.readFileSync(config.wasmPath);
    const abi = JSON.parse(fs.readFileSync(config.abiPath, "utf8"));

    console.log("[Deploy] WASM size:", wasm.length, "bytes");
    console.log("[Deploy] ABI loaded successfully");

    // Deploy contract code (WASM)
    console.log("[Deploy] Setting contract code...");
    const setCodeResult = await api.transact({
      actions: [{
        account: "eosio",
        name: "setcode",
        authorization: [{
          actor: config.contractAccount,
          permission: "active"
        }],
        data: {
          account: config.contractAccount,
          vmtype: 0,
          vmversion: 0,
          code: wasm.toString("hex")
        }
      }]
    }, {
      blocksBehind: 3,
      expireSeconds: 30
    });

    console.log("[Deploy] Set code transaction:", (setCodeResult as any).transaction_id);

    // Deploy contract ABI
    console.log("[Deploy] Setting contract ABI...");
    const setAbiResult = await api.transact({
      actions: [{
        account: "eosio",
        name: "setabi",
        authorization: [{
          actor: config.contractAccount,
          permission: "active"
        }],
        data: {
          account: config.contractAccount,
          abi: Buffer.from(JSON.stringify(abi)).toString("hex")
        }
      }]
    }, {
      blocksBehind: 3,
      expireSeconds: 30
    });

    console.log("[Deploy] Set ABI transaction:", (setAbiResult as any).transaction_id);
    console.log("[Deploy] Contract deployed successfully!");

    // Verify deployment
    const accountInfo = await rpc.get_account(config.contractAccount);
    console.log("[Deploy] Contract account info:", accountInfo.account_name);

  } catch (error: any) {
    console.error("[Deploy] Deployment failed:", error);
    if (error.json) {
      console.error("[Deploy] Error details:", JSON.stringify(error.json, null, 2));
    }
    throw error;
  }
}

// Main deployment script
async function main() {
  
  const config: DeployConfig = {
    rpcEndpoint: process.env.EOS_RPC_ENDPOINT || "http://127.0.0.1:8888",
    contractAccount: process.env.CONTRACT_ACCOUNT || "counter",
    contractPrivateKey: process.env.CONTRACT_ACTIVE_PRIVATE_KEY || process.env.CONTRACT_PRIVATE_KEY || "",
    wasmPath: path.join(__dirname, "..", "build", "counter.wasm"),
    abiPath: path.join(__dirname, "..", "counter.abi")
  };

  if (!config.contractPrivateKey) {
    throw new Error("CONTRACT_PRIVATE_KEY environment variable is required");
  }

  // Check if files exist
  if (!fs.existsSync(config.wasmPath)) {
    console.error(`[Deploy] WASM file not found at ${config.wasmPath}`);
    console.error("[Deploy] Please run 'yarn build' first to compile the contract");
    process.exit(1);
  }

  if (!fs.existsSync(config.abiPath)) {
    console.error(`[Deploy] ABI file not found at ${config.abiPath}`);
    process.exit(1);
  }

  await deployContract(config);
}

// Run deployment
main().catch((error) => {
  console.error("[Deploy] Fatal error:", error);
  process.exit(1);
});