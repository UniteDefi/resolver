import { Blockfrost } from "lucid-cardano";
import dotenv from "dotenv";

dotenv.config();

async function checkBalance() {
  try {
    const projectId = process.env.BLOCKFROST_PREPROD_PROJECT_ID;
    const address = process.env.PREPROD_WALLET_ADDRESS;
    
    if (!projectId || !address) {
      throw new Error("Missing BLOCKFROST_PREPROD_PROJECT_ID or PREPROD_WALLET_ADDRESS in .env");
    }
    
    console.log("[Balance Check] Checking balance for:", address);
    
    const blockfrost = new Blockfrost(
      "https://cardano-preprod.blockfrost.io/api/v0",
      projectId
    );
    
    const utxos = await blockfrost.getUtxos(address);
    
    let totalLovelace = 0n;
    utxos.forEach(utxo => {
      totalLovelace += utxo.assets.lovelace;
    });
    
    const ada = Number(totalLovelace) / 1_000_000;
    
    console.log(`[Balance Check] Total balance: ${ada} ADA (${totalLovelace} lovelace)`);
    console.log(`[Balance Check] Number of UTxOs: ${utxos.length}`);
    
    if (totalLovelace > 0n) {
      console.log("[Balance Check] ✅ Wallet is funded and ready for deployment!");
    } else {
      console.log("[Balance Check] ❌ Wallet has no funds. Please fund it first.");
    }
    
    return totalLovelace > 0n;
  } catch (error) {
    console.error("[Balance Check] Error:", error);
    return false;
  }
}

checkBalance();