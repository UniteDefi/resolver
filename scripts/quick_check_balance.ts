import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function quickCheckBalance() {
  const walletInfo = JSON.parse(fs.readFileSync(path.join(process.cwd(), "new_deployer_wallet.json"), 'utf-8'));
  const address = walletInfo.address;
  
  console.log("[QuickCheck] Checking balance for:", address);
  
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  const [sepoliaBalance, baseSepoliaBalance] = await Promise.all([
    sepoliaProvider.getBalance(address),
    baseSepoliaProvider.getBalance(address)
  ]);
  
  console.log("\nBalances:");
  console.log("  Sepolia:", ethers.formatEther(sepoliaBalance), "ETH");
  console.log("  Base Sepolia:", ethers.formatEther(baseSepoliaBalance), "ETH");
  
  const totalBalance = sepoliaBalance + baseSepoliaBalance;
  
  if (totalBalance > 0n) {
    console.log("\n✅ Funds detected! Total:", ethers.formatEther(totalBalance), "ETH");
    
    if (sepoliaBalance >= ethers.parseEther("0.1") && baseSepoliaBalance >= ethers.parseEther("0.1")) {
      console.log("✅ Sufficient funds on both networks for deployment");
      console.log("\nRun: yarn tsx scripts/deploy_all_real.ts");
    } else {
      console.log("⚠️  Funds detected but may not be sufficient for all deployments");
      console.log("Recommended: 0.1+ ETH on each network");
    }
  } else {
    console.log("\n⏳ No funds detected yet");
    console.log("\nPlease send ETH to:", address);
    console.log("- Sepolia: https://sepolia.etherscan.io/address/" + address);
    console.log("- Base Sepolia: https://sepolia.basescan.org/address/" + address);
  }
}

quickCheckBalance().catch(console.error);