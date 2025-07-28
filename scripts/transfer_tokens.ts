import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function transferTokens() {
  // Load wallet and deployments
  const walletInfo = JSON.parse(fs.readFileSync(path.join(process.cwd(), "new_deployer_wallet.json"), 'utf-8'));
  const deployerPrivateKey = walletInfo.privateKey;
  const deployerWallet = new ethers.Wallet(deployerPrivateKey);
  
  const deployments = JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployed_contracts.json"), 'utf-8'));
  
  // Test wallet addresses
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const resolverAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  
  console.log("[TransferTokens] Transferring tokens to test wallets...\n");
  
  // Connect to networks
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  const sepoliaWallet = deployerWallet.connect(sepoliaProvider);
  const baseSepoliaWallet = deployerWallet.connect(baseSepoliaProvider);
  
  // ERC20 ABI for transfer
  const erc20Abi = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];
  
  try {
    // 1. Transfer USDT on Sepolia
    console.log("=== Transferring USDT on Sepolia ===");
    const usdtContract = new ethers.Contract(deployments.sepolia.usdtToken, erc20Abi, sepoliaWallet);
    
    const usdtDecimals = await usdtContract.decimals();
    const usdtBalance = await usdtContract.balanceOf(deployerWallet.address);
    console.log("Deployer USDT balance:", ethers.formatUnits(usdtBalance, usdtDecimals));
    
    if (usdtBalance > 0n) {
      const amountToTransfer = ethers.parseUnits("1000", usdtDecimals); // 1000 USDT
      
      console.log("Transferring 1000 USDT to user...");
      const tx1 = await usdtContract.transfer(userAddress, amountToTransfer);
      console.log("Transaction hash:", tx1.hash);
      await tx1.wait();
      console.log("✅ Transferred 1000 USDT to user");
      
      console.log("Transferring 1000 USDT to resolver...");
      const tx2 = await usdtContract.transfer(resolverAddress, amountToTransfer);
      console.log("Transaction hash:", tx2.hash);
      await tx2.wait();
      console.log("✅ Transferred 1000 USDT to resolver");
    }
    
    // 2. Check if we can transfer DAI on Base Sepolia
    console.log("\n=== Checking DAI on Base Sepolia ===");
    const daiContract = new ethers.Contract(deployments.baseSepolia.daiToken, erc20Abi, baseSepoliaWallet);
    
    try {
      const daiDecimals = await daiContract.decimals();
      const daiBalance = await daiContract.balanceOf(deployerWallet.address);
      console.log("Deployer DAI balance:", ethers.formatUnits(daiBalance, daiDecimals));
      
      if (daiBalance === 0n) {
        console.log("⚠️  No DAI balance to transfer (mint failed earlier)");
      }
    } catch (error) {
      console.log("⚠️  Could not check DAI balance:", error.message);
    }
    
    // 3. Send small ETH amounts for gas
    console.log("\n=== Sending ETH for gas ===");
    const ethAmount = ethers.parseEther("0.01"); // 0.01 ETH for gas
    
    // Only send on Sepolia if we have enough
    const sepoliaBalance = await sepoliaProvider.getBalance(deployerWallet.address);
    if (sepoliaBalance > ethers.parseEther("0.05")) {
      console.log("Sending 0.01 ETH to user on Sepolia...");
      const ethTx1 = await sepoliaWallet.sendTransaction({
        to: userAddress,
        value: ethAmount
      });
      await ethTx1.wait();
      console.log("✅ Sent 0.01 ETH to user");
      
      console.log("Sending 0.01 ETH to resolver on Sepolia...");
      const ethTx2 = await sepoliaWallet.sendTransaction({
        to: resolverAddress,
        value: ethAmount
      });
      await ethTx2.wait();
      console.log("✅ Sent 0.01 ETH to resolver");
    } else {
      console.log("⚠️  Insufficient ETH balance on Sepolia for transfers");
    }
    
    // Check final balances
    console.log("\n=== Final Balances ===");
    const userUsdtBalance = await usdtContract.balanceOf(userAddress);
    const resolverUsdtBalance = await usdtContract.balanceOf(resolverAddress);
    
    console.log("User USDT balance:", ethers.formatUnits(userUsdtBalance, usdtDecimals));
    console.log("Resolver USDT balance:", ethers.formatUnits(resolverUsdtBalance, usdtDecimals));
    
    console.log("\n✅ Token transfers completed!");
    
  } catch (error) {
    console.error("❌ Transfer failed:", error);
  }
}

transferTokens().catch(console.error);