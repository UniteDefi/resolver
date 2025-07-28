import { ethers } from "ethers";

async function checkFundingTxs() {
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  // Sepolia funding transactions
  const sepoliaTxs = [
    "0x57da72ab319dcfcd3ae79506214704455f4ae990f159712823cc234528164d92",
    "0x93a70333b97aad7d1430e665029caaa8c45d6a398ce2785a5bedeb692646ae67"
  ];
  
  // Base Sepolia funding transaction
  const baseTxs = [
    "0x47658063562552e4642cbd88eebfc7aa7daf8db07986d019cd63b3e2f4a795a0"
  ];
  
  console.log("=== Checking Sepolia Funding Transactions ===");
  for (const hash of sepoliaTxs) {
    try {
      const receipt = await sepoliaProvider.getTransactionReceipt(hash);
      if (receipt) {
        console.log(`\nTransaction: ${hash}`);
        console.log("  Status:", receipt.status === 1 ? "Success" : "Failed");
        console.log("  To:", receipt.to);
        console.log("  Block:", receipt.blockNumber);
        console.log("  Gas Used:", receipt.gasUsed.toString());
      } else {
        console.log(`Transaction ${hash}: Not found or pending`);
      }
    } catch (error) {
      console.log(`Transaction ${hash}: Error -`, error.message);
    }
  }
  
  console.log("\n=== Checking Base Sepolia Funding Transactions ===");
  for (const hash of baseTxs) {
    try {
      const receipt = await baseSepoliaProvider.getTransactionReceipt(hash);
      if (receipt) {
        console.log(`\nTransaction: ${hash}`);
        console.log("  Status:", receipt.status === 1 ? "Success" : "Failed");
        console.log("  To:", receipt.to);
        console.log("  Block:", receipt.blockNumber);
        console.log("  Gas Used:", receipt.gasUsed.toString());
      } else {
        console.log(`Transaction ${hash}: Not found or pending`);
      }
    } catch (error) {
      console.log(`Transaction ${hash}: Error -`, error.message);
    }
  }
  
  // Check actual balances
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const resolverAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  
  console.log("\n=== Current Balances ===");
  const userSepoliaBalance = await sepoliaProvider.getBalance(userAddress);
  const resolverSepoliaBalance = await sepoliaProvider.getBalance(resolverAddress);
  const userBaseBalance = await baseSepoliaProvider.getBalance(userAddress);
  const resolverBaseBalance = await baseSepoliaProvider.getBalance(resolverAddress);
  
  console.log("Sepolia:");
  console.log("  User:", ethers.formatEther(userSepoliaBalance), "ETH");
  console.log("  Resolver:", ethers.formatEther(resolverSepoliaBalance), "ETH");
  console.log("\nBase Sepolia:");
  console.log("  User:", ethers.formatEther(userBaseBalance), "ETH");
  console.log("  Resolver:", ethers.formatEther(resolverBaseBalance), "ETH");
}

checkFundingTxs().catch(console.error);