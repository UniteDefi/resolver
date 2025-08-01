import { Account, ec, json, stark, RpcProvider, hash, CallData } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function generateWallet() {
  console.log("[Wallet] Generating new StarkNet wallet...");
  
  // Generate private key
  const privateKey = stark.randomAddress();
  console.log("[Wallet] Private key generated");
  
  // Derive public key
  const starkKeyPub = ec.starkCurve.getStarkKey(privateKey);
  console.log("[Wallet] Public key derived");
  
  // Initialize provider for testnet
  const provider = new RpcProvider({ 
    nodeUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7" 
  });
  
  // Account class hash for OpenZeppelin Account v0.8.1 on Sepolia
  const accountClassHash = "0x04c6d6cf894f8bc96bb9c525e6853e5483177841f7388f74a46cfda6f028c755";
  
  // Calculate account address
  const accountConstructorCallData = CallData.compile({ publicKey: starkKeyPub });
  const accountAddress = hash.calculateContractAddressFromHash(
    starkKeyPub,
    accountClassHash,
    accountConstructorCallData,
    0
  );
  
  console.log("\n[Wallet] ✅ Wallet generated successfully!");
  console.log("\n=== WALLET DETAILS ===");
  console.log(`Address: ${accountAddress}`);
  console.log(`Private Key: ${privateKey}`);
  console.log(`Public Key: ${starkKeyPub}`);
  
  // Save to .env file
  const envPath = path.join(__dirname, "../.env");
  const envContent = `# StarkNet Configuration

# Network Configuration
# For testnet (Sepolia)
STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io/rpc/v0_7
# For mainnet
STARKNET_MAINNET_RPC_URL=https://starknet-mainnet.public.blastapi.io/rpc/v0_7

# Account Configuration
# Your StarkNet account address (0x prefixed)
STARKNET_ACCOUNT_ADDRESS=${accountAddress}

# Private key for the account (0x prefixed)
# NEVER commit your actual private key!
STARKNET_PRIVATE_KEY=${privateKey}

# Public key
STARKNET_PUBLIC_KEY=${starkKeyPub}

# Account class hash (OpenZeppelin Account v0.8.1)
STARKNET_ACCOUNT_CLASS_HASH=${accountClassHash}

# Contract Addresses (will be populated after deployment)
# Counter contract address on testnet
COUNTER_CONTRACT_ADDRESS=

# Counter contract address on mainnet
COUNTER_CONTRACT_ADDRESS_MAINNET=

# Network selection (testnet or mainnet)
NETWORK=testnet
`;
  
  fs.writeFileSync(envPath, envContent);
  console.log("\n[Wallet] Environment variables saved to .env");
  
  // Save wallet info to a separate file for reference
  const walletInfo = {
    network: "starknet-sepolia",
    address: accountAddress,
    publicKey: starkKeyPub,
    privateKey: privateKey,
    classHash: accountClassHash,
    generatedAt: new Date().toISOString(),
    status: "NOT_DEPLOYED",
    deploymentInstructions: {
      step1: "Fund the wallet address with ETH on Starknet Sepolia testnet",
      step2: "Run 'yarn deploy:account' to deploy the account contract",
      faucets: [
        "https://faucet.starknet.io/",
        "https://starknet-faucet.vercel.app/"
      ]
    }
  };
  
  const walletPath = path.join(__dirname, "../wallet-info.json");
  fs.writeFileSync(walletPath, JSON.stringify(walletInfo, null, 2));
  console.log("[Wallet] Wallet info saved to wallet-info.json");
  
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Fund this address with ETH on Starknet Sepolia:");
  console.log(`   ${accountAddress}`);
  console.log("\n2. You can use these faucets:");
  console.log("   - https://faucet.starknet.io/");
  console.log("   - https://starknet-faucet.vercel.app/");
  console.log("\n3. After funding, run: yarn deploy:account");
  console.log("\n⚠️  IMPORTANT: Keep your private key secure and never share it!");
}

generateWallet().catch(console.error);