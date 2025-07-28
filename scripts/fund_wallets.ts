import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

async function fundWallets() {
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  
  // Use the deployer private key
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const deployerWallet = new ethers.Wallet(deployerPrivateKey);
  const sepoliaDeployer = deployerWallet.connect(sepoliaProvider);
  const baseDeployer = deployerWallet.connect(baseSepoliaProvider);
  
  // Test wallet addresses
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const resolverAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  
  const amountToSend = ethers.parseEther("0.01"); // 0.01 ETH each to conserve funds
  
  console.log("Funding wallets...");
  console.log("Deployer address:", deployerWallet.address);
  
  // Check deployer balances first
  const sepoliaBalance = await sepoliaProvider.getBalance(deployerWallet.address);
  const baseSepoliaBalance = await baseSepoliaProvider.getBalance(deployerWallet.address);
  
  console.log("\nDeployer balances:");
  console.log("  Sepolia:", ethers.formatEther(sepoliaBalance), "ETH");
  console.log("  Base Sepolia:", ethers.formatEther(baseSepoliaBalance), "ETH");
  
  const sepoliaAmount = ethers.parseEther("0.015"); // Less on Sepolia due to limited funds
  const baseAmount = amountToSend; // 0.01 ETH on Base
  
  if (sepoliaBalance < sepoliaAmount * 2n || baseSepoliaBalance < baseAmount * 2n) {
    console.error("\n❌ Insufficient balance to fund wallets!");
    console.log("Need at least", ethers.formatEther(sepoliaAmount * 2n), "ETH on Sepolia");
    console.log("Need at least", ethers.formatEther(baseAmount * 2n), "ETH on Base Sepolia");
    return;
  }
  
  try {
    // Fund on Sepolia
    console.log("Funding on Sepolia...");
    const tx1 = await sepoliaDeployer.sendTransaction({
      to: userAddress,
      value: sepoliaAmount
    });
    console.log(`  User funding tx: ${tx1.hash}`);
    
    const tx2 = await sepoliaDeployer.sendTransaction({
      to: resolverAddress,
      value: sepoliaAmount
    });
    console.log(`  Resolver funding tx: ${tx2.hash}`);
    
    // Fund on Base Sepolia
    console.log("\nFunding on Base Sepolia...");
    const tx3 = await baseDeployer.sendTransaction({
      to: userAddress,
      value: baseAmount
    });
    console.log(`  User funding tx: ${tx3.hash}`);
    
    const tx4 = await baseDeployer.sendTransaction({
      to: resolverAddress,
      value: baseAmount
    });
    console.log(`  Resolver funding tx: ${tx4.hash}`);
    
    console.log("\nWaiting for confirmations...");
    await Promise.all([tx1.wait(), tx2.wait(), tx3.wait(), tx4.wait()]);
    
    console.log("\nFunding complete!");
  } catch (error) {
    console.error("Error funding wallets:", error);
  }
}

fundWallets().catch(console.error);