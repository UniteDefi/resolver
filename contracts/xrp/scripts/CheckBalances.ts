import { Client, Wallet } from "xrpl";
import * as dotenv from "dotenv";

dotenv.config();

async function checkBalances() {
  console.log("💰 Checking XRPL Wallet Balances\n");
  
  const SERVER_URL = process.env.XRPL_SERVER_URL || "wss://s.altnet.rippletest.net:51233";
  const client = new Client(SERVER_URL);
  
  try {
    await client.connect();
    console.log(`✅ Connected to ${SERVER_URL}\n`);

    // Get wallet addresses
    const wallets = [
      { name: "Deployer", address: process.env.XRPL_DEPLOYER_ADDRESS },
      { name: "User", address: process.env.XRPL_USER_ADDRESS },
      { name: "Resolver0", address: process.env.XRPL_RESOLVER_ADDRESS_0 },
      { name: "Resolver1", address: process.env.XRPL_RESOLVER_ADDRESS_1 },
      { name: "Resolver2", address: process.env.XRPL_RESOLVER_ADDRESS_2 },
      { name: "Resolver3", address: process.env.XRPL_RESOLVER_ADDRESS_3 },
    ];

    console.log("📊 Current Balances:");
    console.log("===================");
    
    for (const wallet of wallets) {
      if (!wallet.address) {
        console.log(`${wallet.name}: Address not found in .env`);
        continue;
      }

      try {
        const balance = await client.getXrpBalance(wallet.address);
        const balanceNum = parseFloat(balance);
        
        let status = "";
        if (balanceNum === 0) {
          status = "❌ NEEDS FUNDING";
        } else if (balanceNum < 100) {
          status = "⚠️  LOW BALANCE";
        } else if (balanceNum < 1000) {
          status = "✅ SUFFICIENT";
        } else {
          status = "🚀 WELL FUNDED";
        }
        
        console.log(`${wallet.name.padEnd(10)}: ${balance.padStart(10)} XRP ${status}`);
      } catch (error) {
        console.log(`${wallet.name.padEnd(10)}: Account not found (needs initial funding)`);
      }
    }

    // Check deployer specifically
    const deployerAddress = process.env.XRPL_DEPLOYER_ADDRESS;
    if (deployerAddress) {
      try {
        const deployerBalance = await client.getXrpBalance(deployerAddress);
        const balanceNum = parseFloat(deployerBalance);
        
        console.log("\n🎯 Deployer Status:");
        console.log(`Address: ${deployerAddress}`);
        console.log(`Balance: ${deployerBalance} XRP`);
        
        if (balanceNum < 1000) {
          console.log("\n🚨 DEPLOYER NEEDS MORE FUNDING!");
          console.log("🌐 Fund at: https://xrpl.org/xrp-testnet-faucet.html");
          console.log("💵 Recommended: 10,000+ XRP");
          console.log("⏰ Each faucet request gives ~1,000 XRP");
          console.log("🔄 You may need to request multiple times");
        } else {
          console.log("✅ Deployer has sufficient funds for deployment!");
        }
      } catch (error) {
        console.log("\n❌ Deployer account not found!");
        console.log("🌐 Fund at: https://xrpl.org/xrp-testnet-faucet.html");
        console.log(`📧 Address: ${deployerAddress}`);
      }
    }

  } catch (error) {
    console.error("❌ Error checking balances:", error);
  } finally {
    await client.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  checkBalances().catch(console.error);
}

export { checkBalances };