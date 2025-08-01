import { Client } from "xrpl";
import dotenv from "dotenv";

dotenv.config();

async function checkBalances() {
  const client = new Client(process.env.XRP_SERVER_URL!);
  
  try {
    await client.connect();
    console.log("[CheckBalance] Connected to XRP Ledger");
    
    const accounts = [
      { name: "Faucet", address: process.env.XRP_FAUCET_ADDRESS! },
      { name: "Source (Escrow Creator)", address: process.env.XRP_SOURCE_ADDRESS! },
      { name: "Destination (Escrow Receiver)", address: process.env.XRP_DESTINATION_ADDRESS! },
    ];
    
    console.log("\n[CheckBalance] Account balances:");
    
    for (const account of accounts) {
      try {
        const balance = await client.getXrpBalance(account.address);
        console.log(`${account.name}: ${balance} XRP`);
      } catch (error: any) {
        console.log(`${account.name}: Account not found or error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error("[CheckBalance] Error:", error);
  } finally {
    await client.disconnect();
    console.log("\n[CheckBalance] Disconnected from XRP Ledger");
  }
}

checkBalances().catch(console.error);