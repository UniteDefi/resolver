import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function monitorFunding() {
  const walletInfo = JSON.parse(fs.readFileSync(path.join(process.cwd(), "new_deployer_wallet.json"), 'utf-8'));
  const address = walletInfo.address;
  
  console.log("[MonitorFunding] Monitoring wallet for incoming funds...");
  console.log("Address:", address);
  console.log("\n📋 Please send 0.2 ETH to this address on:");
  console.log("- Ethereum Sepolia: https://sepolia.etherscan.io/address/" + address);
  console.log("- Base Sepolia: https://sepolia.basescan.org/address/" + address);
  
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  let sepoliaFunded = false;
  let baseSepoliaFunded = false;
  
  console.log("\n⏳ Checking every 10 seconds...\n");
  
  while (!sepoliaFunded || !baseSepoliaFunded) {
    const sepoliaBalance = await sepoliaProvider.getBalance(address);
    const baseSepoliaBalance = await baseSepoliaProvider.getBalance(address);
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Balances:`);
    console.log(`  Sepolia: ${ethers.formatEther(sepoliaBalance)} ETH`);
    console.log(`  Base Sepolia: ${ethers.formatEther(baseSepoliaBalance)} ETH`);
    
    if (sepoliaBalance >= ethers.parseEther("0.1") && !sepoliaFunded) {
      console.log("  ✅ Sepolia funded!");
      sepoliaFunded = true;
    }
    
    if (baseSepoliaBalance >= ethers.parseEther("0.1") && !baseSepoliaFunded) {
      console.log("  ✅ Base Sepolia funded!");
      baseSepoliaFunded = true;
    }
    
    if (sepoliaFunded && baseSepoliaFunded) {
      console.log("\n🎉 Both networks funded! Ready to deploy.");
      console.log("\nStarting deployments...");
      
      // Run deployment script
      const { exec } = await import('child_process');
      exec('yarn tsx scripts/deploy_all_real.ts', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
          return;
        }
        console.log(stdout);
      });
      
      break;
    }
    
    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

monitorFunding().catch(console.error);