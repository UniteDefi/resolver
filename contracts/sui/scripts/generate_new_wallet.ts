import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import * as fs from "fs";
import * as path from "path";

// Generate a new keypair
const keypair = new Ed25519Keypair();
const address = keypair.toSuiAddress();

// Export the keypair to get the private key
const exportedKeypair = keypair.export();
const privateKey = exportedKeypair.privateKey;

console.log("[Wallet Generation] New wallet created:");
console.log("Address:", address);
console.log("Private Key (32 bytes hex):", privateKey);

// Verify we can recreate the keypair from the private key
const verifyKeypair = Ed25519Keypair.fromSecretKey(privateKey);
const verifyAddress = verifyKeypair.toSuiAddress();
console.log("\n[Verification] Recreated address:", verifyAddress);
console.log("[Verification] Addresses match:", address === verifyAddress);

// Update .env file
const envPath = path.join(__dirname, "../.env");
const envContent = `# Sui Configuration
# RPC URL for Sui network (mainnet, testnet, devnet)
SUI_RPC_URL=https://fullnode.devnet.sui.io

# Network name (mainnet, testnet, devnet)
SUI_NETWORK=devnet

# Private key for the deployer account (hex format without 0x prefix)
SUI_PRIVATE_KEY=${privateKey}

# Package ID after deployment (will be set by deploy script)
COUNTER_PACKAGE_ID=

# Counter object ID after deployment (will be set by deploy script)
COUNTER_OBJECT_ID=
`;

fs.writeFileSync(envPath, envContent);
console.log("\n[Wallet Generation] .env file updated with new private key");
console.log("\nPlease fund this address with SUI tokens:", address);