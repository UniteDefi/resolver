import { ethers } from "ethers";

async function checkFundedWallet() {
  // Get the funded wallet address from private key
  const fundedPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const fundedWallet = new ethers.Wallet(fundedPrivateKey);
  
  console.log("[CheckFundedWallet] Checking balances for funded wallet...");
  console.log("Wallet Address:", fundedWallet.address);
  console.log("Private Key:", fundedPrivateKey.substring(0, 10) + "...");
  
  // Sepolia
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const sepoliaBalance = await sepoliaProvider.getBalance(fundedWallet.address);
  console.log("\nSepolia Balance:", ethers.formatEther(sepoliaBalance), "ETH");
  
  // Base Sepolia
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const baseSepoliaBalance = await baseSepoliaProvider.getBalance(fundedWallet.address);
  console.log("Base Sepolia Balance:", ethers.formatEther(baseSepoliaBalance), "ETH");
}

checkFundedWallet().catch(console.error);