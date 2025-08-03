#!/usr/bin/env ts-node

import { Keypair } from "@stellar/stellar-sdk";
import { writeFileSync } from "fs";
import { join } from "path";
import * as crypto from "crypto";

// EVM private keys from the Aptos .env file
const EVM_PRIVATE_KEYS = {
  deployer: "0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3",
  user: "0xfa5aaf38f4e19824782bea1d02a1ccfd192daa89ceb1741de3dcb77e652b1eee",
  resolver0: "0x1d7c3f21a7c7b6531706cecc277dfe7df892f0fc401c8a298ead1dc23928cc58",
  resolver1: "0xce9b4305041da2dd6cc9abbe33e693f0ffe644338226b5a3ae3279e39cecf6d3",
  resolver2: "0xeff69b72e73c936cfd76bcba676ae5365a8a5efe28d3d71cf4eaffc79b2456ce",
  resolver3: "0x28885f9663a5c063c15a618eef72218a552a8f30aed01fb84e66b01b1b9ba2a7",
  relayer: "0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3", // Same as deployer for now
};

const EVM_ADDRESSES = {
  deployer: "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35",
  user: "0x6B9ad963c764a06A7ef8ff96D38D0cB86575eC00",
  resolver0: "0x875eF470dffF58acd5903c704DB65D50022eA994",
  resolver1: "0x24a330C62b739f1511Ec3D41cbfDA5fCc4DD6Ae6",
  resolver2: "0x6e90aB122b10fEad2cAc61c3d362B658d56a273f",
  resolver3: "0x62181aDd17d4b6C7303b26CE6f9A3668835c0E51",
  relayer: "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35", // Same as deployer
};

function generateStellarKeypairFromEVM(evmPrivateKey: string, salt: string = "stellar"): Keypair {
  // Remove 0x prefix if present
  const cleanKey = evmPrivateKey.startsWith("0x") ? evmPrivateKey.slice(2) : evmPrivateKey;
  
  // Create a deterministic seed by hashing the EVM private key with a salt
  const seed = crypto.createHash("sha256")
    .update(cleanKey + salt)
    .digest();
  
  // Use the first 32 bytes as the Stellar seed
  return Keypair.fromRawEd25519Seed(seed);
}

function generateAllStellarWallets() {
  console.log("🌟 Generating Stellar wallets from EVM private keys...");
  
  const stellarWallets: Record<string, { keypair: Keypair; secretKey: string; publicKey: string }> = {};
  
  // Generate Stellar wallets for each role
  Object.entries(EVM_PRIVATE_KEYS).forEach(([role, evmKey]) => {
    const keypair = generateStellarKeypairFromEVM(evmKey);
    stellarWallets[role] = {
      keypair,
      secretKey: keypair.secret(),
      publicKey: keypair.publicKey(),
    };
    
    console.log(`✅ ${role}:`);
    console.log(`   EVM Address: ${EVM_ADDRESSES[role as keyof typeof EVM_ADDRESSES]}`);
    console.log(`   Stellar Address: ${keypair.publicKey()}`);
    console.log(`   Stellar Secret: ${keypair.secret()}`);
    console.log("");
  });
  
  return stellarWallets;
}

function createEnvFile(wallets: Record<string, { secretKey: string; publicKey: string }>) {
  console.log("📝 Creating .env file...");
  
  const envContent = `# Stellar Network Configuration
STELLAR_NETWORK=testnet

# Deployer/Relayer Wallet
STELLAR_SECRET_KEY=${wallets.deployer.secretKey}
STELLAR_DEPLOYER_ADDRESS=${wallets.deployer.publicKey}

# User Wallet
STELLAR_USER_PRIVATE_KEY=${wallets.user.secretKey}
STELLAR_USER_ADDRESS=${wallets.user.publicKey}

# Resolver Wallets
RESOLVER_PRIVATE_KEY_0=${wallets.resolver0.secretKey}
RESOLVER_ADDRESS_0=${wallets.resolver0.publicKey}

RESOLVER_PRIVATE_KEY_1=${wallets.resolver1.secretKey}
RESOLVER_ADDRESS_1=${wallets.resolver1.publicKey}

RESOLVER_PRIVATE_KEY_2=${wallets.resolver2.secretKey}
RESOLVER_ADDRESS_2=${wallets.resolver2.publicKey}

RESOLVER_PRIVATE_KEY_3=${wallets.resolver3.secretKey}
RESOLVER_ADDRESS_3=${wallets.resolver3.publicKey}

# Test User Wallet (for cross-chain testing)
PRIVATE_KEY=${wallets.user.secretKey}
USER_ADDRESS=${wallets.user.publicKey}

# Relayer Wallet (for cross-chain operations)
RELAYER_PRIVATE_KEY=${wallets.relayer.secretKey}
RELAYER_ADDRESS=${wallets.relayer.publicKey}

# Cross-chain Configuration (for testing with EVM chains)
# Base Sepolia Configuration
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/9MExjLYju7RbwL5KDizzG
BASE_SEPOLIA_CHAIN_ID=84532

# EVM Wallet Keys for Cross-Chain Testing (Base Sepolia)
EVM_RESOLVER_PRIVATE_KEY_0=${EVM_PRIVATE_KEYS.resolver0}
EVM_RESOLVER_WALLET_0=${EVM_ADDRESSES.resolver0}

EVM_RESOLVER_PRIVATE_KEY_1=${EVM_PRIVATE_KEYS.resolver1}
EVM_RESOLVER_WALLET_1=${EVM_ADDRESSES.resolver1}

EVM_RESOLVER_PRIVATE_KEY_2=${EVM_PRIVATE_KEYS.resolver2}
EVM_RESOLVER_WALLET_2=${EVM_ADDRESSES.resolver2}

EVM_RESOLVER_PRIVATE_KEY_3=${EVM_PRIVATE_KEYS.resolver3}
EVM_RESOLVER_WALLET_3=${EVM_ADDRESSES.resolver3}

# Base Sepolia Deployer & Test Addresses
EVM_DEPLOYER_ADDRESS=${EVM_ADDRESSES.deployer}
EVM_DEPLOYER_PRIVATE_KEY=${EVM_PRIVATE_KEYS.deployer}

EVM_TEST_USER_PRIVATE_KEY=${EVM_PRIVATE_KEYS.user}
EVM_TEST_USER_ADDRESS=${EVM_ADDRESSES.user}

# Contract Deployment Settings
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015`;

  const envPath = join(__dirname, "..", ".env");
  writeFileSync(envPath, envContent);
  
  console.log(`✅ .env file created at: ${envPath}`);
  return envPath;
}

async function main() {
  console.log("🚀 Setting up Stellar environment from EVM configuration...\n");
  
  try {
    // Generate all Stellar wallets
    const wallets = generateAllStellarWallets();
    
    // Create .env file
    createEnvFile(wallets);
    
    console.log("🎉 Stellar environment setup complete!");
    console.log("\n🔑 DEPLOYER ADDRESS FOR FUNDING:");
    console.log(`${wallets.deployer.publicKey}`);
    console.log("\n📋 Please fund this address with XLM at:");
    console.log("https://laboratory.stellar.org/#account-creator?network=test");
    console.log("\n⚡ Once funded, run:");
    console.log("npm run deploy");
    console.log("npm run fund-wallets");
    console.log("npm run mint-tokens");
    
  } catch (error) {
    console.error("❌ Failed to setup Stellar environment:", error);
    process.exit(1);
  }
}

main();