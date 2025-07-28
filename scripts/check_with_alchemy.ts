import { ethers } from "ethers";

async function checkWithAlchemy() {
  console.log("[CheckWithAlchemy] Checking balances with different RPC...\n");
  
  // Use alternative RPC endpoints
  const sepoliaRpcs = [
    "https://ethereum-sepolia.publicnode.com",
    "https://rpc.sepolia.org",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://eth-sepolia.public.blastapi.io"
  ];
  
  const baseSepoliaRpcs = [
    "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com",
    "https://base-sepolia.publicnode.com"
  ];
  
  const checkAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  
  console.log("Checking address:", checkAddress);
  console.log("\n=== Sepolia ===");
  
  for (const rpc of sepoliaRpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const balance = await provider.getBalance(checkAddress);
      console.log(`${rpc}: ${ethers.formatEther(balance)} ETH`);
      
      // Also check block number to ensure connection
      const blockNumber = await provider.getBlockNumber();
      console.log(`  Block #${blockNumber}`);
      
      if (balance > ethers.parseEther("0.1")) {
        console.log("  ✅ Found funds!");
      }
    } catch (error) {
      console.log(`${rpc}: Error - ${error.message}`);
    }
  }
  
  console.log("\n=== Base Sepolia ===");
  
  for (const rpc of baseSepoliaRpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const balance = await provider.getBalance(checkAddress);
      console.log(`${rpc}: ${ethers.formatEther(balance)} ETH`);
      
      const blockNumber = await provider.getBlockNumber();
      console.log(`  Block #${blockNumber}`);
      
      if (balance > ethers.parseEther("0.1")) {
        console.log("  ✅ Found funds!");
      }
    } catch (error) {
      console.log(`${rpc}: Error - ${error.message}`);
    }
  }
  
  // Check if the user might have funded a different address
  console.log("\n\n💡 If you funded a different address, please share:");
  console.log("1. The address you funded");
  console.log("2. Or the transaction hash from the funding");
  console.log("\nAlternatively, fund this address:");
  console.log("Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
}

checkWithAlchemy().catch(console.error);