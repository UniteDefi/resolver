import dotenv from "dotenv";
import https from "https";

dotenv.config();

async function checkBalance() {
  const projectId = process.env.BLOCKFROST_PREPROD_PROJECT_ID;
  const address = process.env.PREPROD_WALLET_ADDRESS;
  
  if (!projectId || !address) {
    console.error("Missing BLOCKFROST_PREPROD_PROJECT_ID or PREPROD_WALLET_ADDRESS in .env");
    process.exit(1);
  }
  
  console.log("[Balance Check] Checking balance for:", address);
  
  const options = {
    hostname: 'cardano-preprod.blockfrost.io',
    path: `/api/v0/addresses/${address}`,
    method: 'GET',
    headers: {
      'project_id': projectId
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.error) {
            console.error("[Balance Check] Error:", result.error);
            reject(result.error);
            return;
          }
          
          const lovelaceAmount = BigInt(result.amount[0].quantity);
          const adaAmount = Number(lovelaceAmount) / 1_000_000;
          
          console.log(`[Balance Check] Total balance: ${adaAmount} ADA (${lovelaceAmount} lovelace)`);
          
          if (lovelaceAmount > 0n) {
            console.log("[Balance Check] ✅ Wallet is funded and ready for deployment!");
            resolve(true);
          } else {
            console.log("[Balance Check] ❌ Wallet has no funds. Please fund it first.");
            resolve(false);
          }
        } catch (error) {
          console.error("[Balance Check] Error parsing response:", error);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error("[Balance Check] Request error:", error);
      reject(error);
    });
    
    req.end();
  });
}

checkBalance().catch(console.error);