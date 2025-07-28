import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

async function checkTransactions() {
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const baseSepoliaProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  
  const txHashes = {
    sepolia: [
      "0xc8e1e5079ef8c8a7601a06228181a609e92b2b1bf98c76da73d1feda0312b909",
      "0xc333567ab4b4ff8bc20467baa041bc9ee129701fc05f8c855254b6cd9a585506"
    ],
    baseSepolia: [
      "0xb9dc5ce4af9ae2ce43ca4f724ef58e1b9725c818a5481fe7097fcf0085074e80",
      "0x7274551d6cc89b68ffe8509726a7dd771e575720c55c9c371f93afeb1b709634"
    ]
  };
  
  console.log("Checking Sepolia transactions...");
  for (const hash of txHashes.sepolia) {
    try {
      const receipt = await sepoliaProvider.getTransactionReceipt(hash);
      console.log(`  ${hash.substring(0, 10)}... Status: ${receipt ? receipt.status : 'pending'}`);
    } catch (error) {
      console.log(`  ${hash.substring(0, 10)}... Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log("\nChecking Base Sepolia transactions...");
  for (const hash of txHashes.baseSepolia) {
    try {
      const receipt = await baseSepoliaProvider.getTransactionReceipt(hash);
      console.log(`  ${hash.substring(0, 10)}... Status: ${receipt ? receipt.status : 'pending'}`);
    } catch (error) {
      console.log(`  ${hash.substring(0, 10)}... Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

checkTransactions().catch(console.error);