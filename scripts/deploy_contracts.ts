import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

interface DeploymentAddresses {
  sepolia: {
    escrowFactory?: string;
    relayerContract?: string;
    usdtToken?: string;
  };
  baseSepolia: {
    escrowFactory?: string;
    daiToken?: string;
  };
}

async function deployContracts() {
  console.log("[Deploy] Starting contract deployments...\n");
  
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const deployerWallet = new ethers.Wallet(deployerPrivateKey);
  const deployerAddress = deployerWallet.address;
  
  console.log("Deployer Address:", deployerAddress);
  
  // Check balances first
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  const sepoliaBalance = await sepoliaProvider.getBalance(deployerAddress);
  const baseSepoliaBalance = await baseSepoliaProvider.getBalance(deployerAddress);
  
  console.log("Sepolia Balance:", ethers.formatEther(sepoliaBalance), "ETH");
  console.log("Base Sepolia Balance:", ethers.formatEther(baseSepoliaBalance), "ETH");
  
  if (sepoliaBalance < ethers.parseEther("0.01") || baseSepoliaBalance < ethers.parseEther("0.01")) {
    console.error("\n❌ Insufficient balance for deployment!");
    console.log("Please ensure the deployer has at least 0.01 ETH on each network.");
    return;
  }
  
  const deployments: DeploymentAddresses = {
    sepolia: {},
    baseSepolia: {}
  };
  
  try {
    // Deploy EscrowFactory on Sepolia
    console.log("\n=== Deploying EscrowFactory on Sepolia ===");
    const sepoliaCmd = `cd contracts/lib/cross-chain-swap && DEPLOYER_ADDRESS=${deployerAddress} forge script script/DeployEscrowFactory.s.sol --rpc-url https://ethereum-sepolia.publicnode.com --private-key ${deployerPrivateKey} --broadcast --json`;
    
    const sepoliaResult = execSync(sepoliaCmd, { encoding: 'utf-8' });
    console.log("Sepolia deployment result:", sepoliaResult);
    
    // Parse the deployment address from the output
    // This is a simplified parsing - adjust based on actual output format
    const sepoliaMatch = sepoliaResult.match(/Escrow Factory deployed at:\s*(0x[a-fA-F0-9]{40})/);
    if (sepoliaMatch) {
      deployments.sepolia.escrowFactory = sepoliaMatch[1];
      console.log("✅ EscrowFactory deployed on Sepolia:", deployments.sepolia.escrowFactory);
    }
    
    // Deploy EscrowFactory on Base Sepolia
    console.log("\n=== Deploying EscrowFactory on Base Sepolia ===");
    const baseSepoliaCmd = `cd contracts/lib/cross-chain-swap && DEPLOYER_ADDRESS=${deployerAddress} forge script script/DeployEscrowFactory.s.sol --rpc-url https://sepolia.base.org --private-key ${deployerPrivateKey} --broadcast --json`;
    
    const baseSepoliaResult = execSync(baseSepoliaCmd, { encoding: 'utf-8' });
    console.log("Base Sepolia deployment result:", baseSepoliaResult);
    
    const baseSepoliaMatch = baseSepoliaResult.match(/Escrow Factory deployed at:\s*(0x[a-fA-F0-9]{40})/);
    if (baseSepoliaMatch) {
      deployments.baseSepolia.escrowFactory = baseSepoliaMatch[1];
      console.log("✅ EscrowFactory deployed on Base Sepolia:", deployments.baseSepolia.escrowFactory);
    }
    
    // Deploy RelayerContract on Sepolia
    console.log("\n=== Deploying RelayerContract on Sepolia ===");
    // TODO: Add RelayerContract deployment
    
    // Deploy test tokens
    console.log("\n=== Deploying Test Tokens ===");
    // TODO: Add test token deployments
    
    // Save deployment addresses
    const deploymentsPath = path.join(process.cwd(), "deployments.json");
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("\n✅ Deployment addresses saved to deployments.json");
    
    // Update .env file
    console.log("\n=== Updating .env file ===");
    // TODO: Update .env with deployed addresses
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
  }
}

deployContracts().catch(console.error);