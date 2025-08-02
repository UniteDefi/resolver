import { Client, Wallet, xrpToDrops } from "xrpl";
import dotenv from "dotenv";

dotenv.config();

async function fundTestWallets(): Promise<void> {
  console.log("💰 Funding XRPL Test Wallets");
  
  const client = new Client(process.env.XRP_SERVER_URL!);
  
  try {
    await client.connect();
    console.log("✅ Connected to XRPL");

    // List of wallets to check/fund
    const wallets = [
      { name: "User", address: process.env.XRP_USER_ADDRESS! },
      { name: "Resolver 0", address: process.env.XRP_RESOLVER_0_ADDRESS! },
      { name: "Resolver 1", address: process.env.XRP_RESOLVER_1_ADDRESS! }, 
      { name: "Resolver 2", address: process.env.XRP_RESOLVER_2_ADDRESS! },
      { name: "Relayer", address: process.env.XRP_RELAYER_ADDRESS! }
    ];

    console.log("\n📊 Current Balances:");
    for (const wallet of wallets) {
      try {
        const balance = await client.getXrpBalance(wallet.address);
        console.log(`${wallet.name}: ${balance} XRP`);
        
        if (parseFloat(balance) < 20) {
          console.log(`⚠️  ${wallet.name} needs funding!`);
        }
      } catch (error) {
        console.log(`${wallet.name}: Account not found (needs initial funding)`);
      }
    }

    console.log("\n🚰 To fund these wallets:");
    console.log("1. Visit: https://xrpl.org/xrp-testnet-faucet.html");
    console.log("2. Enter each address and request 1000 XRP");
    console.log("3. Fund the following addresses:");
    
    wallets.forEach(wallet => {
      console.log(`   ${wallet.name}: ${wallet.address}`);
    });

    console.log("\n💡 Recommended amounts for testing:");
    console.log("- User: 200 XRP (for swaps)");
    console.log("- Resolvers: 300 XRP each (for liquidity + safety deposits)");
    console.log("- Relayer: 100 XRP (for coordination)");

  } catch (error) {
    console.error("❌ Error checking balances:", error);
  } finally {
    await client.disconnect();
  }
}

if (require.main === module) {
  fundTestWallets().catch(console.error);
}

export { fundTestWallets };
