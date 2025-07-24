import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, baseSepolia, arbitrumSepolia, polygonAmoy } from "viem/chains";
import fs from "fs";

// Contract bytecode and ABI
const contractJson = JSON.parse(
  fs.readFileSync("./contracts/out/SimpleDutchAuction.sol/SimpleDutchAuction.json", "utf8")
);
const bytecode = contractJson.bytecode.object as `0x${string}`;
const abi = contractJson.abi;

// Deployment configuration
const PRIVATE_KEY = "0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3" as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);

const networks = [
  {
    name: "Ethereum Sepolia",
    chain: sepolia,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com"
  },
  {
    name: "Base Sepolia", 
    chain: baseSepolia,
    rpc: "https://sepolia.base.org"
  },
  {
    name: "Polygon Amoy",
    chain: polygonAmoy,
    rpc: "https://rpc-amoy.polygon.technology"
  },
  {
    name: "Arbitrum Sepolia",
    chain: arbitrumSepolia,
    rpc: "https://sepolia-rollup.arbitrum.io/rpc"
  }
];

async function deployToNetwork(network: typeof networks[0]) {
  console.log(`\nDeploying to ${network.name}...`);
  
  try {
    const walletClient = createWalletClient({
      account,
      chain: network.chain,
      transport: http(network.rpc)
    });

    const publicClient = createPublicClient({
      chain: network.chain,
      transport: http(network.rpc)
    });

    console.log("Deployer address:", account.address);
    
    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      account
    });

    console.log("Transaction hash:", hash);
    console.log("Waiting for deployment...");
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const contractAddress = receipt.contractAddress;
    
    console.log(`✅ SimpleDutchAuction deployed to ${network.name} at:`, contractAddress);
    return { 
      network: network.name, 
      address: contractAddress, 
      chainId: network.chain.id,
      transactionHash: hash 
    };
  } catch (error: any) {
    console.error(`❌ Failed to deploy to ${network.name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("Starting deployment of SimpleDutchAuction to all testnets...");
  console.log("Deployer address:", account.address);
  
  const deployments = [];
  
  for (const network of networks) {
    const result = await deployToNetwork(network);
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