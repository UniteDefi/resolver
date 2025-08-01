import * as bitcoin from "bitcoinjs-lib";
import * as dotenv from "dotenv";
import axios from "axios";
import { createClaimTransaction, createRefundTransaction } from "../src/htlc";
import { getKeyPairFromWIF } from "../src/utils";
import { HTLCScripts } from "../src/types";

dotenv.config();

const network = bitcoin.networks.regtest;


async function getUTXO(address: string): Promise<{ txid: string; vout: number; value: number } | null> {
  try {
    const rpcUrl = process.env.REGTEST_API_URL || "http://localhost:18443";
    const rpcUser = process.env.REGTEST_RPC_USER || "rpcuser";
    const rpcPassword = process.env.REGTEST_RPC_PASSWORD || "rpcpassword";
    
    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: Date.now().toString(),
        method: "listunspent",
        params: [1, 9999999, [address]],
      },
      {
        auth: {
          username: rpcUser,
          password: rpcPassword,
        },
      },
    );
    
    const unspent = response.data.result[0];
    if (!unspent) {
      return null;
    }
    
    return {
      txid: unspent.txid,
      vout: unspent.vout,
      value: Math.floor(unspent.amount * 100000000),
    };
  } catch (error) {
    console.error("[Spend HTLC] Error getting UTXO:", error);
    return null;
  }
}

async function broadcastTransaction(txHex: string): Promise<string> {
  const rpcUrl = process.env.REGTEST_API_URL || "http://localhost:18443";
  const rpcUser = process.env.REGTEST_RPC_USER || "rpcuser";
  const rpcPassword = process.env.REGTEST_RPC_PASSWORD || "rpcpassword";
  
  const response = await axios.post(
    rpcUrl,
    {
      jsonrpc: "2.0",
      id: Date.now().toString(),
      method: "sendrawtransaction",
      params: [txHex],
    },
    {
      auth: {
        username: rpcUser,
        password: rpcPassword,
      },
    },
  );
  
  return response.data.result;
}

async function main(): Promise<void> {
  const htlcAddress = process.env.HTLC_ADDRESS;
  const redeemScriptHex = process.env.HTLC_REDEEM_SCRIPT;
  const senderWIF = process.env.SENDER_WIF;
  const recipientWIF = process.env.RECIPIENT_WIF;
  const preimageHex = process.env.HTLC_PREIMAGE;
  const timelock = parseInt(process.env.HTLC_TIMELOCK || "0", 10);
  const spendMode = process.env.SPEND_MODE || "claim";
  
  if (!htlcAddress || !redeemScriptHex || !senderWIF || !recipientWIF) {
    console.error("[Spend HTLC] Missing required environment variables");
    console.error("Required: HTLC_ADDRESS, HTLC_REDEEM_SCRIPT, SENDER_WIF, RECIPIENT_WIF");
    process.exit(1);
  }
  
  console.log("[Spend HTLC] Starting HTLC spend script");
  console.log("  Mode:", spendMode);
  console.log("  HTLC Address:", htlcAddress);
  
  const htlcScripts: HTLCScripts = {
    redeemScript: Buffer.from(redeemScriptHex, "hex"),
    scriptAddress: htlcAddress,
  };
  
  const senderKeyPair = getKeyPairFromWIF(senderWIF, network);
  const recipientKeyPair = getKeyPairFromWIF(recipientWIF, network);
  
  const utxo = await getUTXO(htlcAddress);
  if (!utxo) {
    console.error("[Spend HTLC] No UTXO found for HTLC address");
    process.exit(1);
  }
  
  console.log("[Spend HTLC] Found UTXO:");
  console.log("  TxID:", utxo.txid);
  console.log("  Vout:", utxo.vout);
  console.log("  Value:", utxo.value, "satoshis");
  
  const fee = 1000;
  let tx: bitcoin.Transaction;
  
  if (spendMode === "claim" && preimageHex) {
    console.log("[Spend HTLC] Creating claim transaction");
    const preimage = Buffer.from(preimageHex, "hex");
    
    tx = createClaimTransaction(
      htlcScripts,
      utxo.txid,
      utxo.vout,
      utxo.value,
      preimage,
      recipientKeyPair,
      recipientKeyPair.address,
      fee,
      network,
    );
    
    console.log("[Spend HTLC] Claim to:", recipientKeyPair.address);
  } else {
    console.log("[Spend HTLC] Creating refund transaction");
    
    tx = createRefundTransaction(
      htlcScripts,
      utxo.txid,
      utxo.vout,
      utxo.value,
      senderKeyPair,
      senderKeyPair.address,
      fee,
      timelock,
      network,
    );
    
    console.log("[Spend HTLC] Refund to:", senderKeyPair.address);
  }
  
  const txHex = tx.toHex();
  console.log("[Spend HTLC] Transaction hex:", txHex);
  
  try {
    const txid = await broadcastTransaction(txHex);
    console.log("[Spend HTLC] Transaction broadcast successfully!");
    console.log("  TxID:", txid);
  } catch (error) {
    if (error instanceof Error) {
      console.error("[Spend HTLC] Failed to broadcast transaction:", error.message);
    } else if (typeof error === "object" && error !== null && "response" in error) {
      console.error("[Spend HTLC] Failed to broadcast transaction:", (error as { response?: { data?: unknown } }).response?.data);
    } else {
      console.error("[Spend HTLC] Failed to broadcast transaction:", error);
    }
  }
}

main().catch(console.error);