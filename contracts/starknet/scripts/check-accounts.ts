import { Account, RpcProvider } from "starknet";
import { JsonRpcProvider, Wallet } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function checkAccounts() {
  console.log("🔍 Checking account configurations...");
  
  // Check StarkNet accounts
  console.log("\n--- StarkNet Accounts ---");
  
  const starknetProvider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const accounts = [
    { name: "Main Account", address: process.env.STARKNET_ACCOUNT_ADDRESS, key: process.env.STARKNET_PRIVATE_KEY },
    { name: "Resolver 0", address: process.env.STARKNET_RESOLVER_WALLET_0, key: process.env.STARKNET_RESOLVER_PRIVATE_KEY_0 },
    { name: "Resolver 1", address: process.env.STARKNET_RESOLVER_WALLET_1, key: process.env.STARKNET_RESOLVER_PRIVATE_KEY_1 },
  ];
  
  for (const acc of accounts) {
    if (!acc.address || !acc.key) {
      console.log(`❌ ${acc.name}: Missing configuration`);
      continue;
    }
    
    try {
      const account = new Account(starknetProvider, acc.address, acc.key);
      const nonce = await account.getNonce();
      console.log(`✅ ${acc.name}: ${acc.address} (nonce: ${nonce})`);
    } catch (error: any) {
      if (error.message.includes("Contract not found")) {
        console.log(`⚠️ ${acc.name}: ${acc.address} (not deployed, needs funding)`);
      } else {
        console.log(`❌ ${acc.name}: ${error.message}`);
      }
    }
  }
  
  // Check EVM accounts
  console.log("\n--- EVM Accounts (Base Sepolia) ---");
  
  try {
    const evmProvider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
    
    const evmAccounts = [
      { name: "Main User", key: process.env.PRIVATE_KEY },
      { name: "Resolver 0", key: process.env.RESOLVER_PRIVATE_KEY_0 },
      { name: "Resolver 1", key: process.env.RESOLVER_PRIVATE_KEY_1 },
    ];
    
    for (const acc of evmAccounts) {
      if (!acc.key) {
        console.log(`❌ ${acc.name}: Missing private key`);
        continue;
      }
      
      try {
        const wallet = new Wallet(acc.key, evmProvider);
        const balance = await evmProvider.getBalance(wallet.address);
        console.log(`✅ ${acc.name}: ${wallet.address} (${parseFloat(balance.toString()) / 1e18} ETH)`);
      } catch (error: any) {
        console.log(`❌ ${acc.name}: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.log(`❌ EVM Provider: ${error.message}`);
  }
  
  console.log("\n✅ Account check completed");
}

if (require.main === module) {
  checkAccounts().catch(console.error);
}

export default checkAccounts;
