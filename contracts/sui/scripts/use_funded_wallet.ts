import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { fromB64 } from "@mysten/sui.js/utils";
import * as fs from "fs";
import * as path from "path";

// Original private key that was generated
const originalPrivateKeyHex = "737569707269766b65793171716c6c78666d353734746d71766b6639776c327434346d68636c3937766d35647a73353961723767706a373633647a71646671773076636c786e";

// Convert the suiprivkey format to raw 32-byte private key
// The format is: suiprivkey1<base64 encoded 33 bytes where first byte is 0x00 for Ed25519>
const suiprivkeyPrefix = "suiprivkey1";
const base64Part = originalPrivateKeyHex.slice(suiprivkeyPrefix.length);

// Decode from our hex representation
const fullKeyBytes = Buffer.from(originalPrivateKeyHex, "utf8");
const base64String = fullKeyBytes.toString().slice(suiprivkeyPrefix.length);

// Decode base64 to get the 33 bytes (1 byte flag + 32 byte key)
const keyWithFlag = fromB64(base64String);
// Remove the first byte (0x00 flag) to get the actual 32-byte private key
const privateKeyBytes = keyWithFlag.slice(1);

// Create keypair from the private key bytes
const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
const address = keypair.toSuiAddress();
const privateKey = Buffer.from(privateKeyBytes).toString("hex");

console.log("[Wallet Import] Using funded wallet:");
console.log("Address:", address);
console.log("Private Key (32 bytes hex):", privateKey);

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
console.log("\n[Wallet Import] .env file updated with funded wallet private key");