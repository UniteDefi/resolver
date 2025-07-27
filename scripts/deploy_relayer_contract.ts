import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

dotenv.config();

// Load environment variables
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;
const RELAYER_SERVICE_KEY = process.env.RESOLVER1_WALLET_PRIVATE_KEY!;

if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
  console.error("❌ Missing required environment variables");
  console.error("PRIVATE_KEY:", PRIVATE_KEY ? "✓" : "✗");
  console.error("ALCHEMY_API_KEY:", ALCHEMY_API_KEY ? "✓" : "✗");
  process.exit(1);
}

// Chain configurations
const chains = {
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://base-sepolia.blockscout.com"
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://arbitrum-sepolia.blockscout.com"
  }
};

async function deployRelayerContract() {
  console.log("🚀 Deploying ACTUAL RelayerContract (not mock!)");
  console.log("=" .repeat(60));
  
  const deployments: any = {};
  
  // First compile the contract
  console.log("\n📦 Compiling RelayerContract...");
  try {
    execSync("cd contracts && forge build --contracts src/RelayerContract.sol", { stdio: "inherit" });
  } catch (error) {
    console.error("❌ Failed to compile. Make sure Foundry is installed.");
    console.log("Install Foundry: curl -L https://foundry.paradigm.xyz | bash");
    return;
  }
  
  // Deploy to each chain
  for (const [chainKey, chain] of Object.entries(chains)) {
    console.log(`\n🔗 Deploying to ${chain.name}...`);
    
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const deployer = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`Deployer: ${deployer.address}`);
    
    // Check balance
    const balance = await provider.getBalance(deployer.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
      console.error(`❌ No ETH balance on ${chain.name}`);
      console.log(`Get testnet ETH from faucets`);
      continue;
    }
    
    try {
      // Deploy using Forge script
      console.log("\nDeploying RelayerContract...");
      
      const deployCmd = `cd contracts && forge create --rpc-url ${chain.rpcUrl} ` +
        `--private-key ${PRIVATE_KEY} ` +
        `--etherscan-api-key ${ALCHEMY_API_KEY} ` +
        `--verify ` +
        `src/RelayerContract.sol:RelayerContract`;
      
      const output = execSync(deployCmd, { encoding: "utf-8" });
      console.log(output);
      
      // Extract deployed address from output
      const addressMatch = output.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
      if (!addressMatch) {
        throw new Error("Failed to extract deployed address");
      }
      
      const contractAddress = addressMatch[1];
      console.log(`✅ Deployed at: ${contractAddress}`);
      console.log(`🔍 View on Blockscout: ${chain.blockExplorer}/address/${contractAddress}`);
      
      deployments[chainKey] = {
        chainId: chain.chainId,
        chainName: chain.name,
        relayerContract: contractAddress,
        deployer: deployer.address,
        blockExplorer: `${chain.blockExplorer}/address/${contractAddress}`,
        deployedAt: new Date().toISOString()
      };
      
      // Authorize the relayer service
      if (RELAYER_SERVICE_KEY) {
        console.log("\n🔐 Authorizing relayer service...");
        
        const RELAYER_ABI = [
          "function authorizeRelayer(address relayer) external"
        ];
        
        const contract = new ethers.Contract(contractAddress, RELAYER_ABI, deployer);
        const relayerWallet = new ethers.Wallet(RELAYER_SERVICE_KEY, provider);
        
        console.log(`Relayer Service Address: ${relayerWallet.address}`);
        
        const authTx = await contract.authorizeRelayer(relayerWallet.address);
        console.log(`Authorization TX: ${authTx.hash}`);
        await authTx.wait();
        console.log("✅ Relayer service authorized");
      }
      
    } catch (error: any) {
      console.error(`❌ Deployment failed on ${chain.name}:`, error.message);
      
      // Try alternative deployment method
      console.log("\nTrying alternative deployment method...");
      
      try {
        // Read compiled bytecode
        const artifactPath = path.join(__dirname, "../contracts/out/RelayerContract.sol/RelayerContract.json");
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        
        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, deployer);
        const contract = await factory.deploy();
        
        console.log(`Deploy TX: ${contract.deploymentTransaction()?.hash}`);
        await contract.waitForDeployment();
        
        const address = await contract.getAddress();
        console.log(`✅ Deployed at: ${address}`);
        
        deployments[chainKey] = {
          chainId: chain.chainId,
          chainName: chain.name,
          relayerContract: address,
          deployer: deployer.address,
          blockExplorer: `${chain.blockExplorer}/address/${address}`,
          deployedAt: new Date().toISOString()
        };
        
      } catch (altError: any) {
        console.error("Alternative deployment also failed:", altError.message);
      }
    }
  }
  
  // Save deployments
  const deploymentsPath = path.join(__dirname, "../relayer_contract_deployments.json");
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`\n💾 Deployments saved to: ${deploymentsPath}`);
  
  // Update relayer service configuration
  console.log("\n📝 Next steps:");
  console.log("1. Update relayer service to use these contract addresses");
  console.log("2. Verify contracts on Blockscout (if not auto-verified)");
  console.log("3. Run integration tests with real contract");
  
  return deployments;
}

// Run deployment
deployRelayerContract()
  .then(deployments => {
    console.log("\n✅ Deployment complete!");
    console.log("\nDeployed contracts:");
    Object.entries(deployments).forEach(([chain, info]: [string, any]) => {
      console.log(`${info.chainName}: ${info.relayerContract}`);
    });
  })
  .catch(console.error);