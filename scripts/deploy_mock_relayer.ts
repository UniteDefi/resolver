import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;

// Chain configurations
const chains = {
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  }
};

async function deployMockRelayer() {
  console.log("🚀 Deploying Mock Relayer Contracts");
  
  const deployments: any = {};
  
  // First compile the contract
  console.log("\n📦 Compiling contracts...");
  try {
    execSync("cd contracts && forge build", { stdio: "inherit" });
  } catch (error) {
    console.error("❌ Failed to compile contracts. Make sure Foundry is installed.");
    return;
  }
  
  // Read compiled artifact
  const artifactPath = path.join(__dirname, "../contracts/out/MockRelayer.sol/MockRelayer.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("❌ Compiled artifact not found. Make sure the contract compiled successfully.");
    return;
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const bytecode = artifact.bytecode.object;
  const abi = artifact.abi;
  
  // Deploy to each chain
  for (const [chainKey, chainConfig] of Object.entries(chains)) {
    console.log(`\n🔗 Deploying to ${chainConfig.name}...`);
    
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
    
    console.log("👤 Deployer:", deployer.address);
    
    // Check balance
    const balance = await provider.getBalance(deployer.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
      console.error("❌ Insufficient balance for deployment");
      continue;
    }
    
    try {
      // Deploy contract
      const factory = new ethers.ContractFactory(abi, bytecode, deployer);
      const contract = await factory.deploy();
      
      console.log("📝 Transaction hash:", contract.deploymentTransaction()?.hash);
      console.log("⏳ Waiting for confirmation...");
      
      await contract.waitForDeployment();
      const address = await contract.getAddress();
      
      console.log("✅ Deployed at:", address);
      
      deployments[chainKey] = {
        chainId: chainConfig.chainId,
        name: chainConfig.name,
        relayerContract: address,
        deployer: deployer.address,
        deployedAt: new Date().toISOString()
      };
      
      // Authorize the relayer service wallet
      const relayerServiceAddress = process.env.RELAYER_WALLET_ADDRESS;
      if (relayerServiceAddress) {
        console.log("🔐 Authorizing relayer service:", relayerServiceAddress);
        const tx = await contract.authorizeRelayer(relayerServiceAddress);
        await tx.wait();
        console.log("✅ Relayer service authorized");
      }
      
    } catch (error: any) {
      console.error(`❌ Failed to deploy on ${chainConfig.name}:`, error.message);
    }
  }
  
  // Save deployments
  const deploymentsPath = path.join(__dirname, "../mock_relayer_deployments.json");
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`\n💾 Deployments saved to: ${deploymentsPath}`);
  
  // Update relayer service config
  console.log("\n📝 Update your relayer service with these addresses:");
  for (const [chainKey, deployment] of Object.entries(deployments)) {
    console.log(`${deployment.name}: ${deployment.relayerContract}`);
  }
}

// Run deployment
deployMockRelayer().catch(console.error);