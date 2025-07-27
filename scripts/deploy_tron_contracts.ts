import TronWeb from "tronweb";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Tron Configuration
const TRON_CONFIG = {
  fullHost: process.env.TRON_SHASTA_RPC || "https://api.shasta.trongrid.io",
  privateKey: process.env.TRON_PRIVATE_KEY || "",
};

// Contract artifacts paths
const ARTIFACTS_PATH = path.join(__dirname, "../dist/contracts");

interface DeploymentResult {
  contractName: string;
  address: string;
  txId: string;
  timestamp: number;
}

class TronDeployer {
  private tronWeb: any;
  private deployments: DeploymentResult[] = [];

  constructor() {
    this.tronWeb = new TronWeb({
      fullHost: TRON_CONFIG.fullHost,
      privateKey: TRON_CONFIG.privateKey,
    });
  }

  async deploy() {
    console.log("[TronDeployer] Starting Tron contract deployment...");
    
    try {
      // Check account balance and resources
      await this.checkAccountResources();
      
      // Deploy contracts
      const mockToken = await this.deployMockToken();
      const simpleDutchAuction = await this.deploySimpleDutchAuction();
      const escrowFactory = await this.deployEscrowFactory();
      
      // Save deployments
      await this.saveDeployments();
      
      console.log("[TronDeployer] Deployment completed successfully!");
      return {
        mockToken,
        simpleDutchAuction,
        escrowFactory,
      };
    } catch (error) {
      console.error("[TronDeployer] Deployment failed:", error);
      throw error;
    }
  }

  private async checkAccountResources() {
    const address = this.tronWeb.address.fromPrivateKey(TRON_CONFIG.privateKey);
    console.log("[TronDeployer] Deployer address:", address);
    
    // Check TRX balance
    const balance = await this.tronWeb.trx.getBalance(address);
    console.log("[TronDeployer] TRX Balance:", this.tronWeb.fromSun(balance), "TRX");
    
    if (balance < this.tronWeb.toSun(100)) {
      throw new Error("Insufficient TRX balance. Please fund your account from Shasta faucet: https://www.trongrid.io/shasta");
    }
    
    // Check resources
    const resources = await this.tronWeb.trx.getAccountResources(address);
    console.log("[TronDeployer] Energy:", resources.EnergyUsed || 0, "/", resources.EnergyLimit || 0);
    console.log("[TronDeployer] Bandwidth:", resources.freeNetUsed || 0, "/", resources.freeNetLimit || 0);
  }

  private async deployMockToken(): Promise<string> {
    console.log("[TronDeployer] Deploying MockToken...");
    
    // Read compiled contract
    const contractPath = path.join(ARTIFACTS_PATH, "MockToken.sol/MockToken.json");
    const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    
    const contract = await this.tronWeb.contract().new({
      abi: contractData.abi,
      bytecode: contractData.bytecode.object,
      parameters: ["Test Token", "TST", 18, this.tronWeb.toHex(1000000 * 10 ** 18)],
      feeLimit: 1500_000_000, // 1500 TRX
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 10_000_000,
    });
    
    const address = this.tronWeb.address.fromHex(contract.address);
    console.log("[TronDeployer] MockToken deployed at:", address);
    
    this.deployments.push({
      contractName: "MockToken",
      address: address,
      txId: contract.transactionHash,
      timestamp: Date.now(),
    });
    
    return address;
  }

  private async deploySimpleDutchAuction(): Promise<string> {
    console.log("[TronDeployer] Deploying SimpleDutchAuction...");
    
    const contractPath = path.join(ARTIFACTS_PATH, "SimpleDutchAuction.sol/SimpleDutchAuction.json");
    const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    
    const contract = await this.tronWeb.contract().new({
      abi: contractData.abi,
      bytecode: contractData.bytecode.object,
      parameters: [],
      feeLimit: 2000_000_000, // 2000 TRX
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 15_000_000,
    });
    
    const address = this.tronWeb.address.fromHex(contract.address);
    console.log("[TronDeployer] SimpleDutchAuction deployed at:", address);
    
    this.deployments.push({
      contractName: "SimpleDutchAuction",
      address: address,
      txId: contract.transactionHash,
      timestamp: Date.now(),
    });
    
    return address;
  }

  private async deployEscrowFactory(): Promise<string> {
    console.log("[TronDeployer] Deploying EscrowFactory...");
    
    // For cross-chain HTLC, we need the EscrowFactory from cross-chain-swap
    const contractPath = path.join(__dirname, "../contracts/lib/cross-chain-swap/out/EscrowFactory.sol/EscrowFactory.json");
    
    if (!fs.existsSync(contractPath)) {
      console.log("[TronDeployer] EscrowFactory not found, need to build cross-chain-swap contracts first");
      throw new Error("EscrowFactory artifact not found. Run: cd contracts/lib/cross-chain-swap && forge build");
    }
    
    const contractData = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    
    // Deploy with Tron-specific parameters
    const contract = await this.tronWeb.contract().new({
      abi: contractData.abi,
      bytecode: contractData.bytecode.object,
      parameters: [
        3600, // rescue delay: 1 hour
        "0x0000000000000000000000000000000000000000", // access token (none for now)
      ],
      feeLimit: 3000_000_000, // 3000 TRX
      callValue: 0,
      userFeePercentage: 100,
      originEnergyLimit: 20_000_000,
    });
    
    const address = this.tronWeb.address.fromHex(contract.address);
    console.log("[TronDeployer] EscrowFactory deployed at:", address);
    
    this.deployments.push({
      contractName: "EscrowFactory",
      address: address,
      txId: contract.transactionHash,
      timestamp: Date.now(),
    });
    
    return address;
  }

  private async saveDeployments() {
    const deploymentsPath = path.join(__dirname, "../deployments_tron.json");
    const deploymentData = {
      network: "tron_shasta",
      timestamp: Date.now(),
      deployments: this.deployments.reduce((acc, dep) => {
        acc[dep.contractName] = {
          address: dep.address,
          txId: dep.txId,
          deployedAt: dep.timestamp,
        };
        return acc;
      }, {} as any),
    };
    
    fs.writeFileSync(deploymentsPath, JSON.stringify(deploymentData, null, 2));
    console.log("[TronDeployer] Deployments saved to:", deploymentsPath);
  }
}

// Main execution
async function main() {
  if (!process.env.TRON_PRIVATE_KEY) {
    console.error("ERROR: TRON_PRIVATE_KEY not set in environment");
    console.log("Please set TRON_PRIVATE_KEY in your .env file");
    console.log("You can get test TRX from: https://www.trongrid.io/shasta");
    process.exit(1);
  }
  
  const deployer = new TronDeployer();
  await deployer.deploy();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { TronDeployer, TRON_CONFIG };