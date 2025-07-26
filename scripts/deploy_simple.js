const { ethers } = require("ethers");
const fs = require("fs");

// Contract bytecode and ABI
const contractJson = JSON.parse(fs.readFileSync("./contracts/out/SimpleDutchAuction.sol/SimpleDutchAuction.json", "utf8"));
const bytecode = contractJson.bytecode.object;
const abi = contractJson.abi;

// Deployment configuration
const PRIVATE_KEY = "0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3";

const networks = {
  "Ethereum Sepolia": {
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111
  },
  "Base Sepolia": {
    rpc: "https://sepolia.base.org",
    chainId: 84532
  },
  "Polygon Amoy": {
    rpc: "https://rpc-amoy.polygon.technology",
    chainId: 80002
  },
  "Arbitrum Sepolia": {
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    chainId: 421614
  }
};

async function deployToNetwork(networkName, config) {
  console.log(`\nDeploying to ${networkName}...`);
  
  try {
    const provider = new ethers.JsonRpcProvider(config.rpc);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log("Deployer address:", wallet.address);
    
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy();
    
    console.log("Transaction hash:", contract.deploymentTransaction().hash);
    console.log("Waiting for deployment...");
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log(`✅ SimpleDutchAuction deployed to ${networkName} at:`, address);
    return { network: networkName, address, chainId: config.chainId };
  } catch (error) {
    console.error(`❌ Failed to deploy to ${networkName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("Starting deployment of SimpleDutchAuction to all testnets...");
  
  const deployments = [];
  
  for (const [networkName, config] of Object.entries(networks)) {
    const result = await deployToNetwork(networkName, config);
    if (result) {
      deployments.push(result);
    }
  }
  
  console.log("\n=== Deployment Summary ===");
  deployments.forEach(d => {
    console.log(`${d.network} (${d.chainId}): ${d.address}`);
  });
  
  // Save deployment addresses
  fs.writeFileSync("deployments.json", JSON.stringify(deployments, null, 2));
  console.log("\nDeployment addresses saved to deployments.json");
}

main().catch(console.error);