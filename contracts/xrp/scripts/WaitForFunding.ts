import { Client } from "xrpl";
import * as dotenv from "dotenv";

dotenv.config();

async function waitForFunding() {
  console.log("⏳ Waiting for deployer funding...\n");
  
  const SERVER_URL = process.env.XRPL_SERVER_URL || "wss://s.altnet.rippletest.net:51233";
  const DEPLOYER_ADDRESS = process.env.XRPL_DEPLOYER_ADDRESS;
  const REQUIRED_BALANCE = 10000; // 10,000 XRP minimum
  
  if (!DEPLOYER_ADDRESS) {
    console.error("❌ XRPL_DEPLOYER_ADDRESS not found in .env");
    process.exit(1);
  }
  
  console.log(`🎯 Deployer Address: ${DEPLOYER_ADDRESS}`);
  console.log(`💰 Required Balance: ${REQUIRED_BALANCE} XRP`);
  console.log(`🌐 Fund at: https://xrpl.org/xrp-testnet-faucet.html`);
  console.log(`🔄 Checking every 30 seconds...\n`);
  
  const client = new Client(SERVER_URL);
  
  try {
    await client.connect();
    
    let attempt = 0;
    
    while (true) {
      attempt++;
      
      try {
        const balance = await client.getXrpBalance(DEPLOYER_ADDRESS);
        const balanceNum = parseFloat(balance);
        
        console.log(`[${new Date().toLocaleTimeString()}] Attempt ${attempt}: ${balance} XRP`);
        
        if (balanceNum >= REQUIRED_BALANCE) {
          console.log(`\n🎉 FUNDING COMPLETE!`);
          console.log(`✅ Deployer has ${balance} XRP (required: ${REQUIRED_BALANCE})`);
          console.log(`🚀 Ready to proceed with deployment!`);
          break;
        } else {
          const needed = REQUIRED_BALANCE - balanceNum;
          console.log(`   Still need: ${needed} XRP`);
          
          if (balanceNum > 0) {
            const progress = (balanceNum / REQUIRED_BALANCE * 100).toFixed(1);
            console.log(`   Progress: ${progress}%`);
          }
        }
        
      } catch (error) {
        console.log(`[${new Date().toLocaleTimeString()}] Attempt ${attempt}: Account not found (not funded yet)`);
      }
      
      // Wait 30 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  waitForFunding().catch(console.error);
}

export { waitForFunding };