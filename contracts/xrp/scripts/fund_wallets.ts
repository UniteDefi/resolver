import { Client, Wallet, xrpToDrops } from "xrpl";
import dotenv from "dotenv";

dotenv.config();

async function fundWallets() {
  const client = new Client(process.env.XRP_SERVER_URL!);
  
  try {
    await client.connect();
    console.log("[FundWallets] Connected to XRP Ledger");
    
    // Faucet wallet
    const faucetWallet = Wallet.fromSeed(process.env.XRP_FAUCET_SECRET!);
    console.log("[FundWallets] Faucet wallet:", faucetWallet.address);
    
    // Check faucet balance
    const faucetBalance = await client.getXrpBalance(faucetWallet.address);
    console.log("[FundWallets] Faucet balance:", faucetBalance, "XRP");
    
    // Wallets to fund (minimum 2 XRP each for testing)
    const walletsToFund = [
      {
        address: process.env.XRP_SOURCE_ADDRESS!,
        amount: "2",
        description: "Source (Escrow Creator)"
      },
      {
        address: process.env.XRP_DESTINATION_ADDRESS!,
        amount: "2",
        description: "Destination (Escrow Receiver)"
      }
    ];
    
    console.log("\n[FundWallets] Funding wallets...");
    
    for (const wallet of walletsToFund) {
      try {
        console.log(`\n[FundWallets] Funding ${wallet.description}: ${wallet.address}`);
        console.log(`[FundWallets] Amount: ${wallet.amount} XRP`);
        
        const payment = {
          TransactionType: "Payment" as const,
          Account: faucetWallet.address,
          Destination: wallet.address,
          Amount: xrpToDrops(wallet.amount),
        };
        
        const prepared = await client.autofill(payment);
        const signed = faucetWallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        
        if (result.result.meta && typeof result.result.meta !== "string" && 
            result.result.meta.TransactionResult === "tesSUCCESS") {
          console.log(`[FundWallets] ✅ Successfully funded ${wallet.description}`);
          console.log(`[FundWallets] Transaction hash: ${result.result.hash}`);
          
          // Check new balance
          const newBalance = await client.getXrpBalance(wallet.address);
          console.log(`[FundWallets] New balance: ${newBalance} XRP`);
        } else {
          console.error(`[FundWallets] ❌ Failed to fund ${wallet.description}:`, result.result.meta);
        }
      } catch (error) {
        console.error(`[FundWallets] Error funding ${wallet.description}:`, error);
      }
    }
    
    // Check remaining faucet balance
    const remainingBalance = await client.getXrpBalance(faucetWallet.address);
    console.log("\n[FundWallets] Remaining faucet balance:", remainingBalance, "XRP");
    
  } catch (error) {
    console.error("[FundWallets] Error:", error);
  } finally {
    await client.disconnect();
    console.log("\n[FundWallets] Disconnected from XRP Ledger");
  }
}

fundWallets().catch(console.error);