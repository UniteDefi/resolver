import { ethers } from "ethers";

async function checkTxDetails() {
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  
  const hash = "0x57da72ab319dcfcd3ae79506214704455f4ae990f159712823cc234528164d92";
  
  try {
    const tx = await sepoliaProvider.getTransaction(hash);
    const receipt = await sepoliaProvider.getTransactionReceipt(hash);
    
    console.log("Transaction Details:");
    console.log("From:", tx.from);
    console.log("To:", tx.to);
    console.log("Value:", ethers.formatEther(tx.value), "ETH");
    console.log("Gas Price:", ethers.formatUnits(tx.gasPrice, "gwei"), "gwei");
    console.log("Block:", receipt.blockNumber);
    console.log("Status:", receipt.status);
    
    // Check if it's actually a transfer
    if (tx.data === "0x") {
      console.log("This is a simple ETH transfer");
    } else {
      console.log("This is a contract interaction");
      console.log("Data:", tx.data);
    }
    
    // Check deployer balance
    const deployerAddress = "0xEB51Ac2f2A23626DA4Dd960E456a384E705dF4a1";
    const deployerBalance = await sepoliaProvider.getBalance(deployerAddress);
    console.log("\nDeployer balance:", ethers.formatEther(deployerBalance), "ETH");
    
    // Check recipient balance  
    const recipientBalance = await sepoliaProvider.getBalance(tx.to);
    console.log("Recipient balance:", ethers.formatEther(recipientBalance), "ETH");
    
  } catch (error) {
    console.error("Error:", error);
  }
}

checkTxDetails().catch(console.error);