import { AptosAccount } from "aptos";
import * as dotenv from "dotenv";

dotenv.config();

function getAccountAddress() {
  const privateKeyHex = process.env.APTOS_PRIVATE_KEY;
  
  if (!privateKeyHex) {
    console.error("[GetAddress] No private key found in environment");
    console.log("[GetAddress] Set APTOS_PRIVATE_KEY in your .env file");
    process.exit(1);
  }

  try {
    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, "hex"));
    const account = new AptosAccount(privateKey);
    
    console.log("[GetAddress] Account Information:");
    console.log("  Address:", account.address().hex());
    console.log("  Public Key:", account.pubKey().hex());
    
    // Also display in different formats
    console.log("\n[GetAddress] Address formats:");
    console.log("  Hex:", account.address().hex());
    console.log("  With 0x:", `0x${account.address().hex()}`);
    console.log("  Short:", `0x${account.address().hex().slice(0, 6)}...${account.address().hex().slice(-4)}`);
    
  } catch (error) {
    console.error("[GetAddress] Invalid private key:", error.message);
    process.exit(1);
  }
}

// Run the script
getAccountAddress();