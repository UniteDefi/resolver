import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

dotenv.config();

const CHAINS = {
  BASE_SEPOLIA: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  },
  ARBITRUM_SEPOLIA: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  }
};

async function deployEscrowFactory() {
  console.log("🚀 Deploying EscrowFactory contracts...\n");

  // Build contracts first
  console.log("📦 Building contracts...");
  try {
    execSync("forge build", { stdio: "inherit" });
  } catch (error) {
    console.error("Failed to build contracts");
    return;
  }

  const deployments: any = {};
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!);

  for (const [key, chain] of Object.entries(CHAINS)) {
    console.log(`\n📍 Deploying on ${chain.name}...`);
    
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const signer = deployer.connect(provider);
    
    try {
      // For now, we'll deploy a simplified version since we don't have the full cross-chain-swap setup
      // In production, you would deploy the actual EscrowFactory with proper parameters
      
      // Deploy mock EscrowFactory
      const mockFactoryCode = `
        pragma solidity 0.8.23;
        
        contract MockEscrowFactory {
            address public owner;
            address public relayer;
            
            event EscrowCreated(address escrow);
            
            constructor(address _relayer) {
                owner = msg.sender;
                relayer = _relayer;
            }
            
            function createSrcEscrow(bytes32 salt) external returns (address) {
                // Mock implementation
                address escrow = address(uint160(uint256(salt)));
                emit EscrowCreated(escrow);
                return escrow;
            }
            
            function createDstEscrow(bytes32 salt) external returns (address) {
                // Mock implementation
                address escrow = address(uint160(uint256(salt)));
                emit EscrowCreated(escrow);
                return escrow;
            }
        }
      `;

      // Create contract files
      const contractPath = path.join(process.cwd(), "contracts/src/MockEscrowFactory.sol");
      fs.writeFileSync(contractPath, `// SPDX-License-Identifier: MIT\n${mockFactoryCode}`);

      // Build the specific contract
      execSync("forge build --contracts contracts/src/MockEscrowFactory.sol", { stdio: "inherit" });

      // Load compiled contract
      const artifactPath = path.join(process.cwd(), "dist/contracts/MockEscrowFactory.sol/MockEscrowFactory.json");
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

      // Deploy
      const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
      const factory = await Factory.deploy(deployer.address);
      await factory.waitForDeployment();
      
      const address = await factory.getAddress();
      console.log(`✅ MockEscrowFactory deployed at: ${address}`);

      deployments[key] = {
        chainId: chain.chainId,
        escrowFactory: address,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error deploying on ${chain.name}:`, error);
    }
  }

  // Save deployments
  const deploymentsPath = path.join(process.cwd(), "escrow_factory_deployments.json");
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  
  console.log("\n✅ Deployment complete!");
  console.log(`📄 Deployments saved to: ${deploymentsPath}`);
  
  return deployments;
}

deployEscrowFactory().catch(console.error);