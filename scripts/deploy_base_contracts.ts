import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Base Sepolia Configuration
const BASE_SEPOLIA_CONFIG = {
  rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  privateKey: process.env.BASE_SEPOLIA_PRIVATE_KEY || "",
  chainId: 84532,
};

// Contract artifacts paths
const ARTIFACTS_PATH = path.join(__dirname, "../dist/contracts");

interface DeploymentResult {
  contractName: string;
  address: string;
  txHash: string;
  timestamp: number;
}

class BaseSepoliaDeployer {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private deployments: DeploymentResult[] = [];

  constructor() {
    this.provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_CONFIG.rpcUrl);
    this.signer = new ethers.Wallet(BASE_SEPOLIA_CONFIG.privateKey, this.provider);
  }

  async deploy() {
    console.log("[BaseDeployer] Starting Base Sepolia contract deployment...");
    
    try {
      // Check account balance
      await this.checkAccountBalance();
      
      // Deploy contracts
      const mockToken = await this.deployMockToken();
      const simpleDutchAuction = await this.deploySimpleDutchAuction();
      const escrowFactory = await this.deployEscrowFactory();
      
      // Save deployments
      await this.saveDeployments();
      
      console.log("[BaseDeployer] Deployment completed successfully!");
      return {
        mockToken,
        simpleDutchAuction,
        escrowFactory,
      };
    } catch (error) {
      console.error("[BaseDeployer] Deployment failed:", error);
      throw error;
    }
  }

  private async checkAccountBalance() {
    const address = await this.signer.getAddress();
    console.log("[BaseDeployer] Deployer address:", address);
    
    const balance = await this.provider.getBalance(address);
    console.log("[BaseDeployer] ETH Balance:", ethers.formatEther(balance), "ETH");
    
    if (balance < ethers.parseEther("0.1")) {
      throw new Error("Insufficient ETH balance. Please fund your account from Base Sepolia faucet");
    }
  }

  private async deployMockToken(): Promise<string> {
    console.log("[BaseDeployer] Deploying MockToken...");
    
    // Read compiled contract
    const contractPath = path.join(ARTIFACTS_PATH, "MockToken.sol/MockToken.json");
    const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    
    const factory = new ethers.ContractFactory(
      contractData.abi,
      contractData.bytecode.object,
      this.signer
    );
    
    const contract = await factory.deploy(
      "Test Token",
      "TST",
      18,
      ethers.parseUnits("1000000", 18)
    );
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log("[BaseDeployer] MockToken deployed at:", address);
    console.log("[BaseDeployer] Transaction hash:", contract.deploymentTransaction()?.hash);
    
    this.deployments.push({
      contractName: "MockToken",
      address: address,
      txHash: contract.deploymentTransaction()?.hash || "",
      timestamp: Date.now(),
    });
    
    return address;
  }

  private async deploySimpleDutchAuction(): Promise<string> {
    console.log("[BaseDeployer] Deploying SimpleDutchAuction...");
    
    const contractPath = path.join(ARTIFACTS_PATH, "SimpleDutchAuction.sol/SimpleDutchAuction.json");
    const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    
    const factory = new ethers.ContractFactory(
      contractData.abi,
      contractData.bytecode.object,
      this.signer
    );
    
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log("[BaseDeployer] SimpleDutchAuction deployed at:", address);
    console.log("[BaseDeployer] Transaction hash:", contract.deploymentTransaction()?.hash);
    
    this.deployments.push({
      contractName: "SimpleDutchAuction",
      address: address,
      txHash: contract.deploymentTransaction()?.hash || "",
      timestamp: Date.now(),
    });
    
    return address;
  }

  private async deployEscrowFactory(): Promise<string> {
    console.log("[BaseDeployer] Deploying EscrowFactory...");
    
    // For cross-chain HTLC, we need the EscrowFactory from cross-chain-swap
    const contractPath = path.join(__dirname, "../contracts/lib/cross-chain-swap/out/EscrowFactory.sol/EscrowFactory.json");
    
    if (!fs.existsSync(contractPath)) {
      console.log("[BaseDeployer] EscrowFactory not found, need to build cross-chain-swap contracts first");
      throw new Error("EscrowFactory artifact not found. Run: cd contracts/lib/cross-chain-swap && forge build");
    }
    
    const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    
    const factory = new ethers.ContractFactory(
      contractData.abi,
      contractData.bytecode.object,
      this.signer
    );
    
    const contract = await factory.deploy(
      3600, // rescue delay: 1 hour
      ethers.ZeroAddress // access token (none for now)
    );
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log("[BaseDeployer] EscrowFactory deployed at:", address);
    console.log("[BaseDeployer] Transaction hash:", contract.deploymentTransaction()?.hash);
    
    this.deployments.push({
      contractName: "EscrowFactory",
      address: address,
      txHash: contract.deploymentTransaction()?.hash || "",
      timestamp: Date.now(),
    });
    
    return address;
  }

  private async saveDeployments() {
    const deploymentsPath = path.join(__dirname, "../deployments_base.json");
    const deploymentData = {
      network: "base_sepolia",
      chainId: BASE_SEPOLIA_CONFIG.chainId,
      timestamp: Date.now(),
      deployments: this.deployments.reduce((acc, dep) => {
        acc[dep.contractName] = {
          address: dep.address,
          txHash: dep.txHash,
          deployedAt: dep.timestamp,
        };
        return acc;
      }, {} as any),
    };
    
    fs.writeFileSync(deploymentsPath, JSON.stringify(deploymentData, null, 2));
    console.log("[BaseDeployer] Deployments saved to:", deploymentsPath);
  }
}

// Main execution
async function main() {
  if (!process.env.BASE_SEPOLIA_PRIVATE_KEY) {
    console.error("ERROR: BASE_SEPOLIA_PRIVATE_KEY not set in environment");
    console.log("Please set BASE_SEPOLIA_PRIVATE_KEY in your .env file");
    console.log("You can get test ETH from Base Sepolia faucet");
    process.exit(1);
  }
  
  const deployer = new BaseSepoliaDeployer();
  await deployer.deploy();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { BaseSepoliaDeployer, BASE_SEPOLIA_CONFIG };