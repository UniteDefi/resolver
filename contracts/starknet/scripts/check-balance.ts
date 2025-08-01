import { RpcProvider } from "starknet";
import * as dotenv from "dotenv";

dotenv.config();

async function checkBalance() {
  console.log("[Balance] Checking account balance...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  
  if (!accountAddress) {
    console.error("[Balance] No account address configured");
    return;
  }
  
  console.log(`[Balance] Checking address: ${accountAddress}`);
  
  try {
    // Check ETH balance using the ETH contract
    const ethTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    
    // Call the balanceOf function directly
    const result = await provider.callContract({
      contractAddress: ethTokenAddress,
      entrypoint: "balanceOf",
      calldata: [accountAddress]
    });
    
    console.log(`[Balance] ETH balance (raw): ${result}`);
    
    // The result is a Uint256, so we get low and high parts
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0"); 
    const balance = low + (high << 128n);
    
    console.log(`[Balance] ETH balance: ${balance} wei`);
    console.log(`[Balance] ETH balance: ${Number(balance) / 1e18} ETH`);
    
    if (balance > 0n) {
      console.log("[Balance] ✅ Account has ETH balance!");
      return true;
    } else {
      console.log("[Balance] ❌ Account has no ETH balance");
      console.log("[Balance] Please fund the account:");
      console.log(`[Balance] Address: ${accountAddress}`);
      return false;
    }
    
  } catch (error: any) {
    console.error("[Balance] Error checking balance:", error.message);
    return false;
  }
}

checkBalance().catch(console.error);