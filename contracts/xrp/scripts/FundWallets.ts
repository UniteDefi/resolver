import { Client, Wallet, xrpToDrops, Payment } from "xrpl";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Usage: Set environment variables before running:
  // FUND_TARGETS="user,resolver0,resolver1" (comma-separated, or "all")
  // FUND_AMOUNT="100" (amount in XRP)
  //
  // Examples:
  // FUND_TARGETS="all" FUND_AMOUNT="100" npm run fund-wallets
  // FUND_TARGETS="user,resolver0" FUND_AMOUNT="50" npm run fund-wallets

  const NETWORK = process.env.XRPL_NETWORK || "testnet";
  const SERVER_URL = process.env.XRPL_SERVER_URL || "wss://s.altnet.rippletest.net:51233";
  const DEPLOYER_SECRET = process.env.XRPL_DEPLOYER_SECRET;
  
  // Read targets and amount from environment
  const targets = process.env.FUND_TARGETS || "all";
  const amountXRP = parseFloat(process.env.FUND_AMOUNT || "100");

  console.log("=== FUNDING WALLETS ===");
  console.log("Network:", NETWORK);
  console.log("Amount per wallet (XRP):", amountXRP);
  console.log("Targets:", targets);

  if (!DEPLOYER_SECRET) {
    console.error("❌ Missing XRPL_DEPLOYER_SECRET");
    process.exit(1);
  }

  const client = new Client(SERVER_URL);
  
  try {
    await client.connect();
    
    const deployerWallet = Wallet.fromSeed(DEPLOYER_SECRET);
    console.log("Deployer:", deployerWallet.address);
    
    // Check deployer balance
    const deployerBalance = await client.getXrpBalance(deployerWallet.address);
    console.log(`Deployer balance: ${deployerBalance} XRP`);

    // Parse targets and get wallet addresses
    const walletsToFund = parseTargets(targets);
    
    if (walletsToFund.length === 0) {
      console.log("❌ No valid targets specified");
      console.log("Valid targets: user, resolver0, resolver1, resolver2, resolver3, all");
      console.log("Set FUND_TARGETS environment variable");
      process.exit(1);
    }

    // Check if deployer has enough balance
    const totalRequired = walletsToFund.length * amountXRP;
    if (parseFloat(deployerBalance) < totalRequired + 10) { // +10 for reserves
      console.log("❌ Insufficient deployer balance");
      console.log("Required (XRP):", totalRequired + 10);
      console.log("Available (XRP):", deployerBalance);
      process.exit(1);
    }

    console.log("\n--- Wallet Details ---");
    for (let i = 0; i < walletsToFund.length; i++) {
      const wallet = walletsToFund[i];
      if (wallet.address) {
        try {
          const balance = await client.getXrpBalance(wallet.address);
          console.log(`${wallet.name}: ${wallet.address} (${balance} XRP)`);
        } catch (error) {
          console.log(`${wallet.name}: ${wallet.address} (new account)`);
        }
      }
    }

    // Fund each wallet
    let successCount = 0;
    for (const wallet of walletsToFund) {
      if (!wallet.address) {
        console.log(`⏭️ Skipping ${wallet.name} - address not found`);
        continue;
      }

      try {
        const payment: Payment = {
          TransactionType: "Payment",
          Account: deployerWallet.address,
          Destination: wallet.address,
          Amount: xrpToDrops(amountXRP),
        };
        
        const prepared = await client.autofill(payment);
        const signed = deployerWallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        
        if (result.result.meta && typeof result.result.meta !== "string" && 
            result.result.meta.TransactionResult === "tesSUCCESS") {
          console.log(`✅ Funded ${wallet.name} with ${amountXRP} XRP`);
          console.log(`   TX: ${result.result.hash}`);
          successCount++;
        } else {
          console.log(`❌ Failed to fund ${wallet.name}`);
        }
      } catch (error: any) {
        console.log(`❌ Error funding ${wallet.name}:`, error.message);
      }
    }

    console.log("\n✅ FUNDING COMPLETE");
    console.log("Successfully funded:", successCount);
    console.log("Total wallets:", walletsToFund.length);
    console.log("Amount per wallet (XRP):", amountXRP);
    console.log("Total sent (XRP):", successCount * amountXRP);
    
    const finalBalance = await client.getXrpBalance(deployerWallet.address);
    console.log("Remaining deployer balance (XRP):", finalBalance);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

interface WalletTarget {
  name: string;
  address: string | null;
}

function parseTargets(targets: string): WalletTarget[] {
  const lowerTargets = targets.toLowerCase();
  
  // Get wallet addresses from environment
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

  // Handle "all" case
  if (lowerTargets === "all") {
    const allWallets: WalletTarget[] = [
      { name: "User", address: user },
      { name: "Resolver0", address: resolver0 },
      { name: "Resolver1", address: resolver1 },
      { name: "Resolver2", address: resolver2 },
      { name: "Resolver3", address: resolver3 },
    ];
    console.log("Selected all wallets for funding");
    return allWallets.filter(w => w.address !== null);
  }

  // Parse comma-separated targets
  const result: WalletTarget[] = [];
  
  if (lowerTargets.includes("user") && user) {
    result.push({ name: "User", address: user });
    console.log("Added user wallet:", user);
  }
  if (lowerTargets.includes("resolver0") && resolver0) {
    result.push({ name: "Resolver0", address: resolver0 });
    console.log("Added resolver0 wallet:", resolver0);
  }
  if (lowerTargets.includes("resolver1") && resolver1) {
    result.push({ name: "Resolver1", address: resolver1 });
    console.log("Added resolver1 wallet:", resolver1);
  }
  if (lowerTargets.includes("resolver2") && resolver2) {
    result.push({ name: "Resolver2", address: resolver2 });
    console.log("Added resolver2 wallet:", resolver2);
  }
  if (lowerTargets.includes("resolver3") && resolver3) {
    result.push({ name: "Resolver3", address: resolver3 });
    console.log("Added resolver3 wallet:", resolver3);
  }

  return result;
}

main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});