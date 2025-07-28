import { ethers } from "ethers";

const addresses = {
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  user: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  resolver: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  relayer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
};

async function checkBalances() {
  console.log("[CheckBalances] Checking testnet balances...\n");
  
  // Sepolia
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  console.log("=== Sepolia Balances ===");
  for (const [name, address] of Object.entries(addresses)) {
    const balance = await sepoliaProvider.getBalance(address);
    console.log(`${name}: ${address} - ${ethers.formatEther(balance)} ETH`);
  }
  
  // Base Sepolia
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  console.log("\n=== Base Sepolia Balances ===");
  for (const [name, address] of Object.entries(addresses)) {
    const balance = await baseSepoliaProvider.getBalance(address);
    console.log(`${name}: ${address} - ${ethers.formatEther(balance)} ETH`);
  }
}

checkBalances().catch(console.error);