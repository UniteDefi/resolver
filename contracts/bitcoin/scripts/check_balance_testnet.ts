import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
  };
}

async function getBalance(address: string): Promise<{ confirmed: number; unconfirmed: number; utxos: UTXO[] }> {
  try {
    const apiUrl = process.env.TESTNET_API_URL || "https://blockstream.info/testnet/api";
    const response = await axios.get<UTXO[]>(`${apiUrl}/address/${address}/utxo`);
    
    const utxos = response.data;
    let confirmed = 0;
    let unconfirmed = 0;
    
    utxos.forEach(utxo => {
      if (utxo.status.confirmed) {
        confirmed += utxo.value;
      } else {
        unconfirmed += utxo.value;
      }
    });
    
    return { confirmed, unconfirmed, utxos };
  } catch (error) {
    console.error("[Check Balance] Error fetching balance:", error);
    return { confirmed: 0, unconfirmed: 0, utxos: [] };
  }
}

async function main(): Promise<void> {
  const address = process.argv[2] || process.env.WALLET_ADDRESS;
  
  if (!address) {
    console.error("Usage: yarn dev scripts/check_balance_testnet.ts [address]");
    console.error("Or set WALLET_ADDRESS in .env");
    process.exit(1);
  }
  
  console.log("[Check Balance] Checking balance for:", address);
  console.log("[Check Balance] Network: Bitcoin Testnet");
  
  const { confirmed, unconfirmed, utxos } = await getBalance(address);
  
  console.log("\n[Check Balance] Results:");
  console.log("  Confirmed balance:", confirmed / 100000000, "BTC");
  console.log("  Unconfirmed balance:", unconfirmed / 100000000, "BTC");
  console.log("  Total balance:", (confirmed + unconfirmed) / 100000000, "BTC");
  console.log("  Number of UTXOs:", utxos.length);
  
  if (utxos.length > 0) {
    console.log("\n[Check Balance] UTXOs:");
    utxos.forEach((utxo, index) => {
      console.log(`  ${index + 1}. TxID: ${utxo.txid}:${utxo.vout}`);
      console.log(`     Value: ${utxo.value / 100000000} BTC`);
      console.log(`     Status: ${utxo.status.confirmed ? "Confirmed" : "Unconfirmed"}`);
    });
  }
  
  console.log(`\n[Check Balance] View on explorer:`);
  console.log(`  https://blockstream.info/testnet/address/${address}`);
}

main().catch(console.error);