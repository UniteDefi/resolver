import { ethers } from "ethers";

async function checkActualBalances() {
  console.log("[CheckActualBalances] Checking all relevant addresses...\n");
  
  const deployerAddress = "0xEB51Ac2f2A23626DA4Dd960E456a384E705dF4a1"; // Our funded deployer
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const resolverAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  console.log("=== Sepolia Balances ===");
  const deployerSepoliaBalance = await sepoliaProvider.getBalance(deployerAddress);
  const userSepoliaBalance = await sepoliaProvider.getBalance(userAddress);
  const resolverSepoliaBalance = await sepoliaProvider.getBalance(resolverAddress);
  
  console.log(`Deployer (${deployerAddress}): ${ethers.formatEther(deployerSepoliaBalance)} ETH`);
  console.log(`User (${userAddress}): ${ethers.formatEther(userSepoliaBalance)} ETH`);
  console.log(`Resolver (${resolverAddress}): ${ethers.formatEther(resolverSepoliaBalance)} ETH`);
  
  console.log("\n=== Base Sepolia Balances ===");
  const deployerBaseBalance = await baseSepoliaProvider.getBalance(deployerAddress);
  const userBaseBalance = await baseSepoliaProvider.getBalance(userAddress);
  const resolverBaseBalance = await baseSepoliaProvider.getBalance(resolverAddress);
  
  console.log(`Deployer: ${ethers.formatEther(deployerBaseBalance)} ETH`);
  console.log(`User: ${ethers.formatEther(userBaseBalance)} ETH`);
  console.log(`Resolver: ${ethers.formatEther(resolverBaseBalance)} ETH`);
  
  // Check USDT balances
  const usdtAddress = "0x79fee2935a5c2AD43eA0bC4E7002C340D04a7dd5";
  const usdtAbi = ["function balanceOf(address) view returns (uint256)"];
  const usdtContract = new ethers.Contract(usdtAddress, usdtAbi, sepoliaProvider);
  
  console.log("\n=== USDT Balances (Sepolia) ===");
  const userUsdtBalance = await usdtContract.balanceOf(userAddress);
  const resolverUsdtBalance = await usdtContract.balanceOf(resolverAddress);
  const deployerUsdtBalance = await usdtContract.balanceOf(deployerAddress);
  
  console.log(`Deployer: ${ethers.formatUnits(deployerUsdtBalance, 6)} USDT`);
  console.log(`User: ${ethers.formatUnits(userUsdtBalance, 6)} USDT`);
  console.log(`Resolver: ${ethers.formatUnits(resolverUsdtBalance, 6)} USDT`);
}

checkActualBalances().catch(console.error);