import { Account, RpcProvider, hash, CallData } from "starknet";
import * as dotenv from "dotenv";

dotenv.config();

async function findAccount() {
  console.log("[FindAccount] Searching for funded account...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const privateKey = "0x023cdf5995235ab6088819fecd630da238f0f9360e6fe0f3c15f4c31f65bfe1a";
  const publicKey = "0x7a10407145d05487a7a32de2ed267827c79b2cf88509f040ae7f2099ef81392";
  
  // Common account class hashes on Sepolia
  const accountClasses = [
    {
      name: "OpenZeppelin v0.8.1",
      classHash: "0x04c6d6cf894f8bc96bb9c525e6853e5483177841f7388f74a46cfda6f028c755"
    },
    {
      name: "OpenZeppelin v0.7.0", 
      classHash: "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f"
    },
    {
      name: "Argent X",
      classHash: "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f"
    },
    {
      name: "Braavos",
      classHash: "0x03131fa018d520a037686ce3efddeab8f28895662f019ca3ca18a626650f7d1e"
    }
  ];
  
  console.log(`[FindAccount] Public Key: ${publicKey}`);
  console.log(`[FindAccount] Private Key: ${privateKey}`);
  
  for (const accountClass of accountClasses) {
    try {
      console.log(`\n[FindAccount] Trying ${accountClass.name}...`);
      
      const constructorCallData = CallData.compile({ publicKey: publicKey });
      const accountAddress = hash.calculateContractAddressFromHash(
        publicKey,
        accountClass.classHash,
        constructorCallData,
        0
      );
      
      console.log(`[FindAccount] Calculated address: ${accountAddress}`);
      
      // Check ETH balance
      const ethTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
      
      const result = await provider.callContract({
        contractAddress: ethTokenAddress,
        entrypoint: "balanceOf",
        calldata: [accountAddress]
      });
      
      const low = BigInt(result[0] || "0");
      const high = BigInt(result[1] || "0");
      const balance = low + (high << 128n);
      
      console.log(`[FindAccount] ETH balance: ${balance} wei`);
      
      if (balance > 0n) {
        console.log(`[FindAccount] ✅ Found funded account!`);
        console.log(`[FindAccount] Account type: ${accountClass.name}`);
        console.log(`[FindAccount] Address: ${accountAddress}`);
        console.log(`[FindAccount] Balance: ${Number(balance) / 1e18} ETH`);
        
        // Test if account contract exists
        try {
          const account = new Account(provider, accountAddress, privateKey);
          const nonce = await account.getNonce();
          console.log(`[FindAccount] ✅ Account contract deployed, nonce: ${nonce}`);
          
          // Update .env with correct address and class hash
          console.log(`\n[FindAccount] Update your .env with:`);
          console.log(`STARKNET_ACCOUNT_ADDRESS=${accountAddress}`);
          console.log(`STARKNET_ACCOUNT_CLASS_HASH=${accountClass.classHash}`);
          
          return {
            address: accountAddress,
            classHash: accountClass.classHash,
            balance: balance,
            deployed: true
          };
          
        } catch (error) {
          console.log(`[FindAccount] ⚠️  Account has balance but contract not deployed yet`);
          return {
            address: accountAddress,
            classHash: accountClass.classHash,
            balance: balance,
            deployed: false
          };
        }
      }
      
    } catch (error: any) {
      console.log(`[FindAccount] Error with ${accountClass.name}: ${error.message}`);
    }
  }
  
  console.log(`\n[FindAccount] ❌ No funded account found`);
  console.log(`[FindAccount] Please ensure you've funded one of the calculated addresses above`);
  return null;
}

findAccount().catch(console.error);