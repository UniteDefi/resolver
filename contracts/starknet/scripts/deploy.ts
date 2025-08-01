import { Account, Contract, RpcProvider, stark, CallData } from "starknet";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

interface DeploymentConfig {
  network: string;
  rpcUrl: string;
  explorerUrl: string;
}

const NETWORKS: { [key: string]: DeploymentConfig } = {
  testnet: {
    network: "starknet-sepolia",
    rpcUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
    explorerUrl: "https://sepolia.starkscan.co"
  },
  mainnet: {
    network: "starknet-mainnet",
    rpcUrl: process.env.STARKNET_MAINNET_RPC_URL || "https://starknet-mainnet.public.blastapi.io/rpc/v0_7",
    explorerUrl: "https://starkscan.co"
  }
};

async function deployCounter(initialValue: number = 0) {
  const network = process.env.NETWORK || "testnet";
  const config = NETWORKS[network];
  
  console.log(`[Deploy] Deploying to ${config.network}`);
  console.log(`[Deploy] RPC URL: ${config.rpcUrl}`);
  
  // Initialize provider
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  
  // Initialize account
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  
  if (!privateKey || !accountAddress) {
    throw new Error("Please set STARKNET_PRIVATE_KEY and STARKNET_ACCOUNT_ADDRESS in .env file");
  }
  
  const account = new Account(provider, accountAddress, privateKey);
  console.log(`[Deploy] Using account: ${accountAddress}`);
  
  try {
    // Load compiled contract
    const contractPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.sierra.json");
    const casmPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.casm.json");
    
    if (!fs.existsSync(contractPath) || !fs.existsSync(casmPath)) {
      console.error("[Deploy] Contract not compiled. Please run 'scarb build' first.");
      process.exit(1);
    }
    
    const compiledContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const compiledCasm = JSON.parse(fs.readFileSync(casmPath, "utf8"));
    
    // Declare the contract class
    console.log("[Deploy] Declaring contract class...");
    const declareResponse = await account.declare({
      contract: compiledContract,
      casm: compiledCasm,
    });
    
    if (declareResponse.transaction_hash) {
      console.log(`[Deploy] Declaration tx: ${declareResponse.transaction_hash}`);
      await provider.waitForTransaction(declareResponse.transaction_hash);
      console.log(`[Deploy] Contract class declared: ${declareResponse.class_hash}`);
    } else {
      console.log(`[Deploy] Contract class already declared: ${declareResponse.class_hash}`);
    }
    
    // Deploy the contract instance
    console.log("[Deploy] Deploying contract instance...");
    const deployResponse = await account.deployContract({
      classHash: declareResponse.class_hash!,
      constructorCalldata: CallData.compile([initialValue]),
    });
    
    console.log(`[Deploy] Deployment tx: ${deployResponse.transaction_hash}`);
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    console.log(`[Deploy] ✅ Contract deployed successfully!`);
    console.log(`[Deploy] Contract address: ${deployResponse.contract_address}`);
    console.log(`[Deploy] Explorer: ${config.explorerUrl}/contract/${deployResponse.contract_address}`);
    
    // Save deployment info
    const deploymentInfo = {
      network: config.network,
      contractAddress: deployResponse.contract_address,
      classHash: declareResponse.class_hash,
      deploymentTx: deployResponse.transaction_hash,
      deployer: accountAddress,
      timestamp: new Date().toISOString(),
      initialValue: initialValue
    };
    
    const deploymentsPath = path.join(__dirname, "../deployments.json");
    let deployments: any = {};
    
    if (fs.existsSync(deploymentsPath)) {
      deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    }
    
    deployments[config.network] = deploymentInfo;
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("[Deploy] Deployment info saved to deployments.json");
    
  } catch (error) {
    console.error("[Deploy] Deployment failed:", error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const initialValue = args[0] ? parseInt(args[0]) : 0;

// Run deployment
deployCounter(initialValue).catch(console.error);