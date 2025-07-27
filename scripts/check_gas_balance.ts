import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

async function checkGasBalance() {
  const chains = [
    {
      name: "Base Sepolia",
      rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    },
    {
      name: "Arbitrum Sepolia", 
      rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    }
  ];

  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!);
  console.log("Deployer address:", deployer.address);
  console.log("\nGas balances:");

  for (const chain of chains) {
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const balance = await provider.getBalance(deployer.address);
    console.log(`${chain.name}: ${ethers.formatEther(balance)} ETH`);
  }
}

checkGasBalance().catch(console.error);