import * as bitcoin from "bitcoinjs-lib";
import * as dotenv from "dotenv";
import { createHTLCAddress } from "../src/htlc";
import { getKeyPairFromWIF, sha256, getCurrentTimestamp } from "../src/utils";
import { HTLCParams } from "../src/types";

dotenv.config();

const network = bitcoin.networks.testnet;

async function main(): Promise<void> {
  console.log("[Create HTLC] Starting HTLC creation for Bitcoin testnet");
  
  // Load wallet from .env
  const walletWIF = process.env.WALLET_WIF;
  if (!walletWIF) {
    console.error("[Create HTLC] WALLET_WIF not found in .env");
    process.exit(1);
  }
  
  // For demo, we'll use the same wallet as both sender and recipient
  // In production, these would be different wallets
  const senderKeyPair = getKeyPairFromWIF(walletWIF, network);
  const recipientKeyPair = getKeyPairFromWIF(walletWIF, network);
  
  const preimage = Buffer.from(process.env.HTLC_PREIMAGE || "mysecretpreimage1234567890123456", "utf8");
  const hashlock = sha256(preimage);
  
  const timelockDuration = parseInt(process.env.HTLC_TIMELOCK_DURATION || "3600", 10);
  const timelock = getCurrentTimestamp() + timelockDuration;
  
  console.log("[Create HTLC] Configuration:");
  console.log("  Network: Bitcoin Testnet");
  console.log("  Sender address:", senderKeyPair.address);
  console.log("  Recipient address:", recipientKeyPair.address);
  console.log("  Preimage:", preimage.toString("hex"));
  console.log("  Hashlock:", hashlock.toString("hex"));
  console.log("  Timelock:", new Date(timelock * 1000).toISOString());
  
  const htlcParams: HTLCParams = {
    hashlock,
    timelock,
    sender: senderKeyPair.publicKey,
    recipient: recipientKeyPair.publicKey,
  };
  
  const htlcScripts = createHTLCAddress(htlcParams, network);
  
  console.log("\n[Create HTLC] HTLC Created:");
  console.log("  Script address:", htlcScripts.scriptAddress);
  console.log("  Redeem script:", htlcScripts.redeemScript.toString("hex"));
  
  console.log("\n[Create HTLC] Next steps:");
  console.log("1. Fund the HTLC address with testnet Bitcoin");
  console.log("2. Use the Blockstream testnet explorer to verify:");
  console.log(`   https://blockstream.info/testnet/address/${htlcScripts.scriptAddress}`);
  
  // Save HTLC details to a file for later use
  const htlcDetails = {
    network: "testnet",
    htlcAddress: htlcScripts.scriptAddress,
    redeemScript: htlcScripts.redeemScript.toString("hex"),
    senderWIF: walletWIF,
    recipientWIF: walletWIF,
    preimage: preimage.toString("hex"),
    hashlock: hashlock.toString("hex"),
    timelock: timelock,
    createdAt: new Date().toISOString(),
  };
  
  const fs = await import("fs");
  const htlcFilePath = "htlc-testnet-details.json";
  fs.writeFileSync(htlcFilePath, JSON.stringify(htlcDetails, null, 2));
  console.log(`\n[Create HTLC] HTLC details saved to ${htlcFilePath}`);
}

main().catch(console.error);