import * as bitcoin from "bitcoinjs-lib";
import * as dotenv from "dotenv";
import { createHTLCAddress } from "../src/htlc";
import { createKeyPair, sha256, getCurrentTimestamp } from "../src/utils";
import { HTLCParams } from "../src/types";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

dotenv.config();

const network = bitcoin.networks.regtest;

async function main(): Promise<void> {
  console.log("[Create HTLC] Starting HTLC creation script");
  
  const senderKeyPair = createKeyPair(network);
  const recipientKeyPair = createKeyPair(network);
  
  const preimage = Buffer.from(process.env.HTLC_PREIMAGE || "mysecretpreimage1234567890123456", "utf8");
  const hashlock = sha256(preimage);
  
  const timelockDuration = parseInt(process.env.HTLC_TIMELOCK_DURATION || "3600", 10);
  const timelock = getCurrentTimestamp() + timelockDuration;
  
  console.log("[Create HTLC] Configuration:");
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
  console.log("1. Fund the HTLC address with Bitcoin");
  console.log("2. To claim: Use spend_htlc.ts with the preimage");
  console.log("3. To refund: Wait until after timelock and use spend_htlc.ts without preimage");
  
  console.log("\n[Create HTLC] Export these for spending:");
  console.log(`export HTLC_ADDRESS="${htlcScripts.scriptAddress}"`);
  console.log(`export HTLC_REDEEM_SCRIPT="${htlcScripts.redeemScript.toString("hex")}"`);
  console.log(`export SENDER_WIF="${ECPair.fromPrivateKey(senderKeyPair.privateKey, { network }).toWIF()}"`);
  console.log(`export RECIPIENT_WIF="${ECPair.fromPrivateKey(recipientKeyPair.privateKey, { network }).toWIF()}"`);
  console.log(`export HTLC_PREIMAGE="${preimage.toString("hex")}"`);
  console.log(`export HTLC_TIMELOCK="${timelock}"`);
}

main().catch(console.error);