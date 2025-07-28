import { ethers } from "ethers";

async function checkTxStatus() {
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  
  const txHashes = [
    "0xc733300265ec13d8a5776b7e5f04deeac269a40f9c55f691dc227a1a43eb6d51",
    "0xb580f0b5e5d162f3660638a277b114b975cbe20b33fe32828bf14771870ee644"
  ];
  
  console.log("[CheckTxStatus] Checking transaction status...\n");
  
  for (const hash of txHashes) {
    try {
      const receipt = await sepoliaProvider.getTransactionReceipt(hash);
      if (receipt) {
        console.log(`Transaction ${hash}:`);
        console.log("  Status:", receipt.status === 1 ? "Success" : "Failed");
        console.log("  Block:", receipt.blockNumber);
        console.log("  To:", receipt.to);
      } else {
        console.log(`Transaction ${hash}: Still pending or not found`);
      }
    } catch (error) {
      console.log(`Transaction ${hash}: Error -`, error.message);
    }
  }
  
  // Check latest balances again
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const resolverAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  
  const userBalance = await sepoliaProvider.getBalance(userAddress);
  const resolverBalance = await sepoliaProvider.getBalance(resolverAddress);
  
  console.log("\nLatest Balances:");
  console.log("User:", ethers.formatEther(userBalance), "ETH");
  console.log("Resolver:", ethers.formatEther(resolverBalance), "ETH");
}

checkTxStatus().catch(console.error);