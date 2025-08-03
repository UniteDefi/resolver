import fs from "fs";
import path from "path";

export interface DeploymentAddresses {
  wrappedNative: { name: string; address: string };
  usdt: { name: string; address: string };
  dai: { name: string; address: string };
  limitOrderProtocol: { address: string };
  uniteEscrowFactory: { address: string };
}

export interface ChainDeployment {
  chainId: number;
  chainName: string;
  contracts: DeploymentAddresses;
  deployer: string;
  rpcUrl?: string;
}

export function loadDeployments(): Record<number, ChainDeployment> {
  // Load from EVM partial deployments
  const deploymentPath = path.resolve(__dirname, "../../../contracts/evm-partial/deployments.json");
  
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found at ${deploymentPath}`);
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const chainDeployments: Record<number, ChainDeployment> = {};
  
  // Process EVM deployments
  if (deploymentData.evm) {
    for (const [networkKey, deployment] of Object.entries(deploymentData.evm)) {
      const chainData = deployment as any;
      
      // Transform EVM deployment format to our internal format
      chainDeployments[chainData.chainId] = {
        chainId: chainData.chainId,
        chainName: chainData.name,
        contracts: {
          limitOrderProtocol: { address: chainData.UniteLimitOrderProtocol },
          uniteEscrowFactory: { address: chainData.UniteEscrowFactory },
          wrappedNative: { name: "MockWrappedNative", address: chainData.MockWrappedNative },
          usdt: { name: "MockUSDT", address: chainData.MockUSDT },
          dai: { name: "MockDAI", address: chainData.MockDAI }
        },
        deployer: process.env.DEPLOYER_ADDRESS || "",
        rpcUrl: getDefaultRpcUrl(chainData.chainId)
      };
    }
  }
  
  return chainDeployments;
}

function getDefaultRpcUrl(chainId: number): string {
  switch (chainId) {
    case 84532: // Base Sepolia
      return process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
    case 421614: // Arbitrum Sepolia
      return process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
    case 11155111: // Ethereum Sepolia
      return process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";
    case 128123: // Etherlink Testnet
      return process.env.ETHERLINK_TESTNET_RPC_URL || "https://node.ghostnet.etherlink.com";
    case 10143: // Monad Testnet
      return process.env.MONAD_TESTNET_RPC_URL || "https://rpc.ankr.com/monad_testnet";
    default:
      return "";
  }
}

export function getChainDeployment(chainId: number): ChainDeployment | undefined {
  const deployments = loadDeployments();
  return deployments[chainId];
}

export function getContractAddress(chainId: number, contractName: keyof DeploymentAddresses | string): string | undefined {
  // Handle resolver contracts and other EVM-specific contracts
  if (contractName.startsWith('UniteResolver') || contractName.includes('Mock') || contractName === 'UniteLimitOrderProtocol' || contractName === 'UniteEscrowFactory') {
    return getEVMContractAddress(chainId, contractName);
  }
  
  const deployment = getChainDeployment(chainId);
  if (!deployment) return undefined;
  
  const contract = deployment.contracts[contractName as keyof DeploymentAddresses];
  return typeof contract === "object" ? contract.address : contract;
}

function getEVMContractAddress(chainId: number, contractName: string): string | undefined {
  const deploymentPath = path.resolve(__dirname, "../../../contracts/evm-partial/deployments.json");
  
  if (!fs.existsSync(deploymentPath)) {
    return undefined;
  }
  
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  
  if (deploymentData.evm) {
    for (const [networkKey, deployment] of Object.entries(deploymentData.evm)) {
      const chainData = deployment as any;
      if (chainData.chainId === chainId) {
        return chainData[contractName];
      }
    }
  }
  
  return undefined;
}