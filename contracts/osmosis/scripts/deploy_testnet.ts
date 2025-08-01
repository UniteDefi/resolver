import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface DeploymentResult {
  network: string;
  codeId: number;
  contractAddress: string;
  timestamp: string;
  initialCount: string;
}

async function deployToTestnet() {
  const network = process.env.NETWORK || "testnet";
  const rpcEndpoint = process.env.TESTNET_RPC_ENDPOINT || "https://rpc.testnet.osmosis.zone:443";
  const mnemonic = process.env.TESTNET_MNEMONIC;
  
  if (!mnemonic) {
    throw new Error("TESTNET_MNEMONIC environment variable is required");
  }
  
  const prefix = "osmo";
  
  console.log("[Deploy/Testnet] Setting up wallet...");
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix,
  });
  
  const [account] = await wallet.getAccounts();
  const walletAddress = account.address;
  console.log("[Deploy/Testnet] Wallet address:", walletAddress);
  
  console.log("[Deploy/Testnet] Connecting to", network, "at", rpcEndpoint);
  const client = await SigningCosmWasmClient.connectWithSigner(
    rpcEndpoint,
    wallet,
    {
      gasPrice: GasPrice.fromString("0.025uosmo"),
    }
  );
  
  const balance = await client.getBalance(walletAddress, "uosmo");
  console.log("[Deploy/Testnet] Balance:", balance.amount, balance.denom);
  
  if (parseInt(balance.amount) < 1000000) {
    throw new Error("Insufficient balance. Need at least 1 OSMO for deployment");
  }
  
  const wasmPath = join(__dirname, "../contracts/counter/target/wasm32-unknown-unknown/release/counter.wasm");
  const wasm = readFileSync(wasmPath);
  
  console.log("[Deploy/Testnet] Uploading contract (", wasm.length, "bytes)...");
  const uploadResult = await client.upload(
    walletAddress,
    wasm,
    "auto"
  );
  
  console.log("[Deploy/Testnet] Upload successful!");
  console.log("[Deploy/Testnet] Code ID:", uploadResult.codeId);
  console.log("[Deploy/Testnet] Transaction hash:", uploadResult.transactionHash);
  console.log("[Deploy/Testnet] Gas used:", uploadResult.gasUsed);
  
  const instantiateMsg = {
    count: process.env.INITIAL_COUNT || "0",
  };
  
  console.log("[Deploy/Testnet] Instantiating contract with initial count:", instantiateMsg.count);
  const instantiateResult = await client.instantiate(
    walletAddress,
    uploadResult.codeId,
    instantiateMsg,
    "Counter Contract",
    "auto",
    {
      admin: walletAddress,
    }
  );
  
  console.log("[Deploy/Testnet] Instantiation successful!");
  console.log("[Deploy/Testnet] Contract address:", instantiateResult.contractAddress);
  console.log("[Deploy/Testnet] Transaction hash:", instantiateResult.transactionHash);
  console.log("[Deploy/Testnet] Gas used:", instantiateResult.gasUsed);
  
  const query = { get_count: {} };
  const countResult = await client.queryContractSmart(instantiateResult.contractAddress, query);
  console.log("[Deploy/Testnet] Initial count verified:", countResult.count);
  
  const deployment: DeploymentResult = {
    network,
    codeId: uploadResult.codeId,
    contractAddress: instantiateResult.contractAddress,
    timestamp: new Date().toISOString(),
    initialCount: instantiateMsg.count,
  };
  
  const deploymentsPath = join(__dirname, "../deployments.json");
  let deployments: DeploymentResult[] = [];
  
  try {
    const existingDeployments = readFileSync(deploymentsPath, "utf-8");
    deployments = JSON.parse(existingDeployments);
  } catch (e) {
    console.log("[Deploy/Testnet] No existing deployments file, creating new one");
  }
  
  deployments.push(deployment);
  writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("[Deploy/Testnet] Deployment saved to deployments.json");
  
  return deployment;
}

deployToTestnet()
  .then((result) => {
    console.log("[Deploy/Testnet] Deployment complete!", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("[Deploy/Testnet] Error:", error);
    process.exit(1);
  });