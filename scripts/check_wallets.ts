import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

async function checkWallets() {
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const baseSepoliaProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  
  const wallets = [
    { name: "Deployer/Relayer", privateKey: process.env.PRIVATE_KEY },
    { name: "User", privateKey: process.env.USER_PRIVATE_KEY },
    { name: "Resolver", privateKey: process.env.RESOLVER_PRIVATE_KEY }
  ];
  
  console.log("Checking wallet balances...\n");
  
  for (const wallet of wallets) {
    if (!wallet.privateKey) continue;
    
    const address = new ethers.Wallet(wallet.privateKey).address;
    console.log(`${wallet.name} Wallet: ${address}`);
    
    try {
      const sepoliaBalance = await sepoliaProvider.getBalance(address);
      const baseBalance = await baseSepoliaProvider.getBalance(address);
      
      console.log(`  Sepolia ETH: ${ethers.formatEther(sepoliaBalance)}`);
      console.log(`  Base Sepolia ETH: ${ethers.formatEther(baseBalance)}`);
    } catch (error) {
      console.log(`  Error checking balance: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log();
  }
}

checkWallets().catch(console.error);