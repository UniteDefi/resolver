import { Account, RpcProvider, Contract, CallData } from "starknet";
import * as dotenv from "dotenv";

dotenv.config();

async function basicTest() {
  console.log("[BasicTest] Testing basic StarkNet operations...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  
  if (!accountAddress || !privateKey) {
    console.error("[BasicTest] Missing account configuration");
    return;
  }
  
  try {
    const account = new Account(provider, accountAddress, privateKey);
    
    // Test account by getting nonce
    const nonce = await account.getNonce();
    console.log(`[BasicTest] ✅ Account nonce: ${nonce}`);
    
    // Test with a simple contract call to a known contract (ETH token)
    const ethTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    
    // Simple ABI for balance check
    const ethAbi = [
      {
        "name": "balanceOf",
        "type": "function",
        "inputs": [
          {
            "name": "account",
            "type": "felt"
          }
        ],
        "outputs": [
          {
            "name": "balance",
            "type": "Uint256"
          }
        ],
        "state_mutability": "view"
      }
    ];
    
    const ethContract = new Contract(ethAbi, ethTokenAddress, provider);
    
    console.log("[BasicTest] Checking ETH balance...");
    const balance = await ethContract.balanceOf(accountAddress);
    console.log(`[BasicTest] ETH balance: ${balance} wei`);
    
    if (BigInt(balance.low) > 0n || BigInt(balance.high) > 0n) {
      console.log("[BasicTest] ✅ Account has ETH balance - ready for transactions!");
      
      console.log("\n[BasicTest] 🎉 Ready to deploy contracts!");
      console.log("\nTo proceed:");
      console.log("1. Install Scarb if not already installed");
      console.log("2. Run: scarb build");
      console.log("3. Run: yarn setup");
      
      return true;
    } else {
      console.log("[BasicTest] ⚠️  Account has no ETH - please fund it");
      return false;
    }
    
  } catch (error: any) {
    console.error("[BasicTest] Error:", error.message);
    
    if (error.message?.includes("Contract not found")) {
      console.log("\n[BasicTest] ⚠️  Account not deployed yet");
      console.log("[BasicTest] Please fund the account first:");
      console.log(`[BasicTest] Address: ${accountAddress}`);
      return false;
    }
    
    return false;
  }
}

basicTest().catch(console.error);