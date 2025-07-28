import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function sendEthForGas() {
  console.log("[SendETH] Sending ETH to test wallets for gas...\n");
  
  const walletInfo = JSON.parse(fs.readFileSync(path.join(process.cwd(), "new_deployer_wallet.json"), 'utf-8'));
  const deployerPrivateKey = walletInfo.privateKey;
  const deployerWallet = new ethers.Wallet(deployerPrivateKey);
  
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const resolverAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const sepoliaWallet = deployerWallet.connect(sepoliaProvider);
  
  try {
    const balance = await sepoliaProvider.getBalance(deployerWallet.address);
    console.log("Deployer Balance:", ethers.formatEther(balance), "ETH");
    
    const amountToSend = ethers.parseEther("0.01"); // 0.01 ETH each
    
    // Send to user
    console.log("\nSending 0.01 ETH to user...");
    const tx1 = await sepoliaWallet.sendTransaction({
      to: userAddress,
      value: amountToSend
    });
    console.log("Transaction hash:", tx1.hash);
    await tx1.wait();
    console.log("✅ Sent to user");
    
    // Send to resolver
    console.log("\nSending 0.01 ETH to resolver...");
    const tx2 = await sepoliaWallet.sendTransaction({
      to: resolverAddress,
      value: amountToSend
    });
    console.log("Transaction hash:", tx2.hash);
    await tx2.wait();
    console.log("✅ Sent to resolver");
    
    // Check final balances
    const userBalance = await sepoliaProvider.getBalance(userAddress);
    const resolverBalance = await sepoliaProvider.getBalance(resolverAddress);
    
    console.log("\n=== Final ETH Balances ===");
    console.log("User:", ethers.formatEther(userBalance), "ETH");
    console.log("Resolver:", ethers.formatEther(resolverBalance), "ETH");
    
  } catch (error) {
    console.error("❌ Failed to send ETH:", error);
  }
}

sendEthForGas().catch(console.error);