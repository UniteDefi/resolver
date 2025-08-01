import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { toHEX, fromHEX } from "@mysten/sui.js/utils";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Generate a new 32-byte private key
const privateKeyBytes = crypto.randomBytes(32);
const privateKeyHex = privateKeyBytes.toString("hex");

// Create keypair from the private key
const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
const address = keypair.toSuiAddress();

console.log("[Wallet Generation] New wallet created:");
console.log("Address:", address);
console.log("Private Key (hex):", privateKeyHex);
console.log("Private Key Length:", privateKeyBytes.length, "bytes");

// Verify we can recreate the keypair
const verifyKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKeyHex, "hex"));
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
SUI_PRIVATE_KEY=${privateKeyHex}

# Package ID after deployment (will be set by deploy script)
COUNTER_PACKAGE_ID=

# Counter object ID after deployment (will be set by deploy script)
COUNTER_OBJECT_ID=
`;

fs.writeFileSync(envPath, envContent);
console.log("\n[Wallet Generation] .env file updated with new private key");
console.log("\n⚠️  Please fund this address with SUI tokens on devnet:", address);