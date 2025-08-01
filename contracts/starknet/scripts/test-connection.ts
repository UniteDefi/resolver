import { Account, RpcProvider } from "starknet";
import * as dotenv from "dotenv";

dotenv.config();

async function testConnection() {
  console.log("[Test] Testing StarkNet connection...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  console.log(`[Test] RPC URL: ${process.env.STARKNET_RPC_URL}`);
  
  try {
    // Test provider connection
    const chainId = await provider.getChainId();
    console.log(`[Test] ✅ Connected to chain: ${chainId}`);
    
    const blockNumber = await provider.getBlockNumber();
    console.log(`[Test] ✅ Latest block: ${blockNumber}`);
    
    // Test account if configured
    const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
    const privateKey = process.env.STARKNET_PRIVATE_KEY;
    
    if (accountAddress && privateKey) {
      console.log(`[Test] Testing account: ${accountAddress}`);
      
      try {
        const account = new Account(provider, accountAddress, privateKey);
        const nonce = await account.getNonce();
        console.log(`[Test] ✅ Account nonce: ${nonce}`);
        console.log("[Test] ✅ Account exists and is accessible!");
        
        console.log("\n[Test] 🎉 Everything looks good!");
        console.log("\nNext steps:");
        console.log("1. Install Scarb: curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh");
        console.log("2. Compile contracts: scarb build");
        console.log("3. Deploy contracts: yarn setup");
        
      } catch (accountError: any) {
        if (accountError.message?.includes("Contract not found")) {
          console.log("[Test] ⚠️  Account contract not deployed yet.");
          console.log("[Test] This is normal for a new wallet - you need to fund it first.");
          console.log(`[Test] Fund this address: ${accountAddress}`);
          console.log("[Test] Faucets:");
          console.log("  - https://faucet.starknet.io/");
          console.log("  - https://starknet-faucet.vercel.app/");
          console.log("\nAfter funding, the account will be automatically deployed on first transaction.");
        } else {
          console.error("[Test] Account error:", accountError.message);
        }
      }
    } else {
      console.log("[Test] ⚠️  No account configured.");
      console.log("[Test] Run 'yarn generate:wallet' to create a new wallet.");
    }
    
  } catch (error) {
    console.error("[Test] ❌ Connection failed:", error);
  }
}

testConnection().catch(console.error);