import { Account, RpcProvider } from "starknet";
import * as dotenv from "dotenv";

dotenv.config();

async function tryDirectAccount() {
  console.log("[DirectAccount] Trying to connect with existing account...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const privateKey = "0x023cdf5995235ab6088819fecd630da238f0f9360e6fe0f3c15f4c31f65bfe1a";
  
  // If you have an existing account, try some common addresses you might have used
  const possibleAddresses = [
    "0x9f26f08db6240cc694e99939330d50813c51fa58e48c3e9e6f7352802d805c", // Calculated OZ v0.8.1
    "0x2738562e6dc14169926209dbec3a7f89877d091cab79dd6d90a8c45275c98bc", // Calculated OZ v0.7.0  
    "0x70d8f7a18c8c8a57f761382e0f862c6dc1767a1b3eb7d29bdcfe79d99d59bc8", // Calculated Argent
    "0x2dde387af80558427f5b1c3d8fa4cf381a5320c26b1265d22b278985b798532", // Calculated Braavos
  ];
  
  console.log("[DirectAccount] If you know the exact account address you funded, please provide it.");
  console.log("[DirectAccount] Otherwise, let's deploy a new account...");
  
  // Let's try to deploy the first address (OZ v0.8.1) 
  const accountAddress = possibleAddresses[0];
  const account = new Account(provider, accountAddress, privateKey);
  
  try {
    console.log(`[DirectAccount] Attempting to use address: ${accountAddress}`);
    
    // Check if account exists and has balance by trying to make a simple call
    const nonce = await account.getNonce();
    console.log(`[DirectAccount] ✅ Account exists with nonce: ${nonce}`);
    
    // If we get here, the account is deployed, let's check balance
    const ethTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    const result = await provider.callContract({
      contractAddress: ethTokenAddress,
      entrypoint: "balanceOf",
      calldata: [accountAddress]
    });
    
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const balance = low + (high << 128n);
    
    console.log(`[DirectAccount] ETH balance: ${Number(balance) / 1e18} ETH`);
    
    if (balance > 0n) {
      console.log("[DirectAccount] ✅ Ready to deploy contracts!");
      return true;
    } else {
      console.log("[DirectAccount] ⚠️  Account exists but has no ETH balance");
      return false;
    }
    
  } catch (error: any) {
    console.log(`[DirectAccount] Account not deployed yet: ${error.message}`);
    
    // Let's try to deploy it using a pre-funded approach
    console.log("[DirectAccount] The account needs to be funded first before deployment");
    
    // Show all possible addresses that could be funded
    console.log("\n[DirectAccount] Possible addresses to fund:");
    possibleAddresses.forEach((addr, i) => {
      const types = ["OpenZeppelin v0.8.1", "OpenZeppelin v0.7.0", "Argent X", "Braavos"];
      console.log(`${i + 1}. ${types[i]}: ${addr}`);
    });
    
    return false;
  }
}

tryDirectAccount().catch(console.error);