import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function approveTokens() {
  console.log("\n🚀 STEP 1: User approves relayer contract to spend source tokens");
  console.log("=" * 60);
  
  // Load deployments
  const deployments = JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployed_contracts.json"), 'utf-8'));
  
  // User wallet (hardhat account #1)
  const userPrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const userWallet = new ethers.Wallet(userPrivateKey);
  
  console.log("User Address:", userWallet.address);
  console.log("RelayerContract:", deployments.sepolia.relayerContract);
  console.log("USDT Token:", deployments.sepolia.usdtToken);
  
  // Connect to Sepolia
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const sepoliaWallet = userWallet.connect(sepoliaProvider);
  
  // ERC20 ABI for approval
  const erc20Abi = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];
  
  try {
    const usdtContract = new ethers.Contract(deployments.sepolia.usdtToken, erc20Abi, sepoliaWallet);
    
    // Check current allowance
    const currentAllowance = await usdtContract.allowance(userWallet.address, deployments.sepolia.relayerContract);
    const decimals = await usdtContract.decimals();
    const balance = await usdtContract.balanceOf(userWallet.address);
    
    console.log("\n📊 Current Status:");
    console.log("User USDT Balance:", ethers.formatUnits(balance, decimals));
    console.log("Current Allowance:", ethers.formatUnits(currentAllowance, decimals));
    
    // Approve 100 USDT
    const amountToApprove = ethers.parseUnits("100", decimals);
    
    console.log("\n📝 Approval Transaction:");
    console.log("Amount to approve: 100 USDT");
    console.log("Spender:", deployments.sepolia.relayerContract);
    
    console.log("\n🔄 Sending approval transaction...");
    const approveTx = await usdtContract.approve(deployments.sepolia.relayerContract, amountToApprove);
    
    console.log("\n📤 Transaction Details:");
    console.log("Transaction Hash:", approveTx.hash);
    console.log("From:", approveTx.from);
    console.log("To:", approveTx.to);
    console.log("Data:", approveTx.data);
    
    console.log("\n⏳ Waiting for confirmation...");
    const receipt = await approveTx.wait();
    
    console.log("\n✅ Transaction Confirmed!");
    console.log("Block Number:", receipt.blockNumber);
    console.log("Gas Used:", receipt.gasUsed.toString());
    console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
    
    // Verify new allowance
    const newAllowance = await usdtContract.allowance(userWallet.address, deployments.sepolia.relayerContract);
    console.log("\n📊 Updated Allowance:", ethers.formatUnits(newAllowance, decimals), "USDT");
    
    console.log("\n✅ STEP 1 COMPLETE: RelayerContract approved to spend 100 USDT");
    
    // Generate secret for next step
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(secret);
    
    console.log("\n🔐 Generated Secret for Swap:");
    console.log("Secret:", ethers.hexlify(secret));
    console.log("Secret Hash:", secretHash);
    
    // Save for next steps
    const swapData = {
      userAddress: userWallet.address,
      userPrivateKey,
      relayerContract: deployments.sepolia.relayerContract,
      srcToken: deployments.sepolia.usdtToken,
      dstToken: deployments.baseSepolia.daiToken,
      amount: ethers.parseUnits("100", decimals).toString(),
      secret: ethers.hexlify(secret),
      secretHash
    };
    
    fs.writeFileSync(path.join(process.cwd(), "swap_data.json"), JSON.stringify(swapData, null, 2));
    console.log("\n💾 Swap data saved to swap_data.json");
    
  } catch (error) {
    console.error("\n❌ Approval failed:", error);
    throw error;
  }
}

approveTokens().catch(console.error);