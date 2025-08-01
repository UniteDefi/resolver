import { Account, RpcProvider } from "starknet";

async function simpleVerify() {
  const address = "0x0422bec5e5fbe0464b5b8889d874737c4cf72fe4f57bb6fb95b5ee688d96555b";
  const privateKey = "0x023cdf5995235ab6088819fecd630da238f0f9360e6fe0f3c15f4c31f65bfe1a";
  
  const provider = new RpcProvider({ 
    nodeUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  console.log(`[Verify] Testing address: ${address}`);
  
  try {
    const account = new Account(provider, address, privateKey);
    const nonce = await account.getNonce();
    console.log(`[Verify] ✅ Account exists with nonce: ${nonce}`);
    
    // Also check balance again
    const ethTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    const result = await provider.callContract({
      contractAddress: ethTokenAddress,
      entrypoint: "balanceOf",
      calldata: [address]
    });
    
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const balance = low + (high << 128n);
    
    console.log(`[Verify] ETH balance: ${Number(balance) / 1e18} ETH`);
    
    if (balance > 0n) {
      console.log("[Verify] ✅ Account is funded and ready!");
      return true;
    } else {
      console.log("[Verify] ⚠️  Account exists but has no ETH balance");
      return false;
    }
    
  } catch (error: any) {
    if (error.message.includes("Contract not found")) {
      console.log("[Verify] ❌ Account contract not found");
      console.log("[Verify] The funding transaction might still be pending");
      console.log("[Verify] Or this might not be the correct address");
    } else {
      console.log(`[Verify] Error: ${error.message}`);
    }
    return false;
  }
}

simpleVerify().catch(console.error);