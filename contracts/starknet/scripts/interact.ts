import { Account, Contract, RpcProvider } from "starknet";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function interactWithCounter() {
  const network = process.env.NETWORK || "testnet";
  const rpcUrl = network === "mainnet" 
    ? process.env.STARKNET_MAINNET_RPC_URL || "https://starknet-mainnet.public.blastapi.io/rpc/v0_7"
    : process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7";
  
  // Initialize provider
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  
  // Initialize account
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  
  if (!privateKey || !accountAddress) {
    throw new Error("Please set STARKNET_PRIVATE_KEY and STARKNET_ACCOUNT_ADDRESS in .env file");
  }
  
  const account = new Account(provider, accountAddress, privateKey);
  
  // Load contract address from deployments
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    console.error("[Interact] No deployments found. Please deploy the contract first.");
    process.exit(1);
  }
  
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const deployment = deployments[network === "mainnet" ? "starknet-mainnet" : "starknet-sepolia"];
  
  if (!deployment) {
    console.error(`[Interact] No deployment found for ${network}`);
    process.exit(1);
  }
  
  const contractAddress = deployment.contractAddress;
  console.log(`[Interact] Using contract at: ${contractAddress}`);
  
  // Contract ABI
  const abi = [
    {
      "name": "increase_counter",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "state_mutability": "external"
    },
    {
      "name": "decrease_counter",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "state_mutability": "external"
    },
    {
      "name": "get_counter",
      "type": "function",
      "inputs": [],
      "outputs": [
        {
          "name": "counter",
          "type": "felt"
        }
      ],
      "state_mutability": "view"
    }
  ];
  
  const contract = new Contract(abi, contractAddress, provider);
  contract.connect(account);
  
  // Parse command
  const command = process.argv[2];
  
  try {
    switch (command) {
      case "get":
        const counter = await contract.get_counter();
        console.log(`[Interact] Current counter value: ${counter}`);
        break;
        
      case "increase":
        console.log("[Interact] Increasing counter...");
        const increaseTx = await contract.increase_counter();
        console.log(`[Interact] Transaction submitted: ${increaseTx.transaction_hash}`);
        await provider.waitForTransaction(increaseTx.transaction_hash);
        console.log("[Interact] Counter increased successfully!");
        const newValueInc = await contract.get_counter();
        console.log(`[Interact] New counter value: ${newValueInc}`);
        break;
        
      case "decrease":
        console.log("[Interact] Decreasing counter...");
        const decreaseTx = await contract.decrease_counter();
        console.log(`[Interact] Transaction submitted: ${decreaseTx.transaction_hash}`);
        await provider.waitForTransaction(decreaseTx.transaction_hash);
        console.log("[Interact] Counter decreased successfully!");
        const newValueDec = await contract.get_counter();
        console.log(`[Interact] New counter value: ${newValueDec}`);
        break;
        
      default:
        console.log("[Interact] Usage:");
        console.log("  yarn interact get       - Get current counter value");
        console.log("  yarn interact increase  - Increase counter by 1");
        console.log("  yarn interact decrease  - Decrease counter by 1");
        process.exit(1);
    }
  } catch (error) {
    console.error("[Interact] Error:", error);
    process.exit(1);
  }
}

interactWithCounter().catch(console.error);