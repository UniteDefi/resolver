import { Client, Wallet, xrpToDrops, Payment } from "xrpl";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("=== DISTRIBUTING XRP ===");
  
  const NETWORK = process.env.XRPL_NETWORK || "testnet";
  const SERVER_URL = process.env.XRPL_SERVER_URL || "wss://s.altnet.rippletest.net:51233";
  const DEPLOYER_SECRET = process.env.XRPL_DEPLOYER_SECRET;

  if (!DEPLOYER_SECRET) {
    console.error("❌ Missing XRPL_DEPLOYER_SECRET");
    process.exit(1);
  }

  const client = new Client(SERVER_URL);
  
  try {
    await client.connect();
    console.log(`Network: XRPL ${NETWORK}`);

    const deployerWallet = Wallet.fromSeed(DEPLOYER_SECRET);
    console.log(`Distributor: ${deployerWallet.address}`);
    
    // Check deployer balance
    const deployerBalance = await client.getXrpBalance(deployerWallet.address);
    console.log(`Balance: ${deployerBalance} XRP`);

    // Get all wallet addresses
    const getWalletAddress = (envVar: string): string | null => {
      const secret = process.env[envVar];
      if (!secret) return null;
      try {
        return Wallet.fromSeed(secret).address;
      } catch {
        return null;
      }
    };

    const user = getWalletAddress("XRPL_USER_SECRET");
    const resolver0 = getWalletAddress("XRPL_RESOLVER_SECRET_0");
    const resolver1 = getWalletAddress("XRPL_RESOLVER_SECRET_1");
    const resolver2 = getWalletAddress("XRPL_RESOLVER_SECRET_2");
    const resolver3 = getWalletAddress("XRPL_RESOLVER_SECRET_3");

    // Distribution targets with amounts
    interface DistributionTarget {
      name: string;
      address: string;
      amount: number; // XRP amount
    }

    const targets: DistributionTarget[] = [];
    
    if (user) targets.push({ name: "User", address: user, amount: 1000 });
    if (resolver0) targets.push({ name: "Resolver0", address: resolver0, amount: 10000 });
    if (resolver1) targets.push({ name: "Resolver1", address: resolver1, amount: 10000 });
    if (resolver2) targets.push({ name: "Resolver2", address: resolver2, amount: 10000 });
    if (resolver3) targets.push({ name: "Resolver3", address: resolver3, amount: 10000 });

    if (targets.length === 0) {
      console.log("❌ No wallet addresses found");
      console.log("Make sure wallet secrets are set in environment variables");
      process.exit(1);
    }

    // Calculate total needed
    const totalNeeded = targets.reduce((sum, target) => sum + target.amount, 0);
    if (parseFloat(deployerBalance) < totalNeeded + 100) { // +100 for reserves and fees
      console.error(`❌ Insufficient balance. Need ${totalNeeded + 100} XRP`);
      process.exit(1);
    }

    console.log("\n📋 Distribution Plan:");
    for (const target of targets) {
      console.log(`   ${target.name}: ${target.amount} XRP`);
    }
    console.log(`   Total: ${totalNeeded} XRP`);

    // Distribute XRP
    console.log("\n🚀 Starting distribution...");
    
    for (const target of targets) {
      try {
        const payment: Payment = {
          TransactionType: "Payment",
          Account: deployerWallet.address,
          Destination: target.address,
          Amount: xrpToDrops(target.amount),
        };
        
        const prepared = await client.autofill(payment);
        const signed = deployerWallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        
        if (result.result.meta && typeof result.result.meta !== "string" && 
            result.result.meta.TransactionResult === "tesSUCCESS") {
          console.log(`✅ Sent ${target.amount} XRP to ${target.name}`);
          console.log(`   TX: ${result.result.hash}`);
        } else {
          console.error(`❌ Failed to send to ${target.name}`);
        }
      } catch (error: any) {
        console.error(`❌ Error sending to ${target.name}:`, error.message);
      }
    }

    // Final balance
    const finalBalance = await client.getXrpBalance(deployerWallet.address);
    console.log(`\n💰 Final deployer balance: ${finalBalance} XRP`);
    
    console.log("\n✅ DISTRIBUTION COMPLETE");
    console.log("All wallets should now have sufficient XRP for:");
    console.log("- User: 1,000 XRP (for swaps and fees)");
    console.log("- Resolvers: 10,000 XRP each (for liquidity + safety deposits)");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});