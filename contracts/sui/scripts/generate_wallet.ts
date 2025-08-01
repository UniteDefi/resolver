import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import * as fs from "fs";
import * as path from "path";

const keypair = new Ed25519Keypair();
const address = keypair.toSuiAddress();
const privateKeyBytes = keypair.getSecretKey();
const privateKey = Buffer.from(privateKeyBytes).toString("hex").slice(0, 64);

console.log("[Wallet Generation] New wallet created:");
console.log("Address:", address);
console.log("Private Key:", privateKey);

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