import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { fromB64 } from "@mysten/sui.js/utils";
import * as fs from "fs";
import * as path from "path";

// The original hex string that was generated
const originalHex = "737569707269766b65793171716c6c78666d353734746d71766b6639776c327434346d68636c3937766d35647a73353961723767706a373633647a71646671773076636c786e";

// Convert hex to string to get the suiprivkey format
const suiprivkeyString = Buffer.from(originalHex, "hex").toString("utf8");
console.log("[Debug] Suiprivkey string:", suiprivkeyString);

// Extract the base64 part (after "suiprivkey1")
const base64Part = suiprivkeyString.slice("suiprivkey1".length);
console.log("[Debug] Base64 part:", base64Part);

try {
  // Decode base64 to get the key bytes
  const keyWithFlag = fromB64(base64Part);
  console.log("[Debug] Key with flag length:", keyWithFlag.length);
  console.log("[Debug] Key with flag hex:", Buffer.from(keyWithFlag).toString("hex"));
  
  // The first byte should be 0x00 for Ed25519
  if (keyWithFlag[0] !== 0x00) {
    throw new Error(`Invalid key type flag: ${keyWithFlag[0]}`);
  }
  
  // Extract the 32-byte private key (skip the first byte)
  const privateKeyBytes = keyWithFlag.slice(1);
  console.log("[Debug] Private key length:", privateKeyBytes.length);
  console.log("[Debug] Private key hex:", Buffer.from(privateKeyBytes).toString("hex"));
  
  // Create keypair from the private key
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const address = keypair.toSuiAddress();
  const privateKey = Buffer.from(privateKeyBytes).toString("hex");
  
  console.log("\n[Wallet Recovery] Successfully recovered wallet:");
  console.log("Address:", address);
  console.log("Private Key (32 bytes hex):", privateKey);
  
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
  console.log("\n[Wallet Recovery] .env file updated with recovered private key");
  
} catch (error) {
  console.error("[Error]", error);
  console.log("\nLet's try a different approach...");
}