import { ethers } from "ethers";

async function sendEthSimple() {
  console.log("[SendETH] Sending ETH to test wallets...\n");
  
  // Using the actual funded deployer wallet
  const deployerPrivateKey = "0x6976e9dad00b499386c3409a283e7b2ae1f83af32bbf74399560b82e06d2a128";
  const deployerWallet = new ethers.Wallet(deployerPrivateKey);
  
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const resolverAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const sepoliaWallet = deployerWallet.connect(sepoliaProvider);
  
  console.log("Deployer address:", deployerWallet.address);
  
  try {
    // Check deployer balance
    const balance = await sepoliaProvider.getBalance(deployerWallet.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
      console.error("❌ Deployer has no ETH!");
      return;
    }
    
    // Send small amounts to conserve funds
    const amountToSend = ethers.parseEther("0.005"); // 0.005 ETH each
    
    // Send to user
    console.log("\nSending 0.005 ETH to user...");
    const tx1 = await sepoliaWallet.sendTransaction({
      to: userAddress,
      value: amountToSend,
      gasLimit: 21000
    });
    console.log("Transaction hash:", tx1.hash);
    console.log("Waiting for confirmation...");
    const receipt1 = await tx1.wait();
    console.log("✅ Confirmed in block:", receipt1.blockNumber);
    
    // Send to resolver
    console.log("\nSending 0.005 ETH to resolver...");
    const tx2 = await sepoliaWallet.sendTransaction({
      to: resolverAddress,
      value: amountToSend,
      gasLimit: 21000
    });
    console.log("Transaction hash:", tx2.hash);
    console.log("Waiting for confirmation...");
    const receipt2 = await tx2.wait();
    console.log("✅ Confirmed in block:", receipt2.blockNumber);
    
    // Wait a bit for balances to update
    console.log("\nWaiting for balances to update...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check final balances
    const userBalance = await sepoliaProvider.getBalance(userAddress);
    const resolverBalance = await sepoliaProvider.getBalance(resolverAddress);
    const deployerFinalBalance = await sepoliaProvider.getBalance(deployerWallet.address);
    
    console.log("\n=== Final Balances ===");
    console.log("Deployer:", ethers.formatEther(deployerFinalBalance), "ETH");
    console.log("User:", ethers.formatEther(userBalance), "ETH");
    console.log("Resolver:", ethers.formatEther(resolverBalance), "ETH");
    
  } catch (error) {
    console.error("❌ Failed to send ETH:", error);
  }
}

sendEthSimple().catch(console.error);