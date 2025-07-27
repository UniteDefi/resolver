import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const LIMIT_ORDER_PROTOCOL = "0x111111125421cA6dc452d289314280a0f8842A65"; // Same on all chains
const ACCESS_TOKEN = "0x0000000000000000000000000000000000000000"; // Using zero address for testing
const RESCUE_DELAY = 691200; // 8 days

async function deployOnChain(chainName: string, rpcUrl: string) {
  console.log(`\n[Deploy] Deploying on ${chainName}...`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  
  console.log(`[Deploy] Deployer: ${deployer.address}`);

  try {
    // Load ABIs
    const escrowFactoryJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "dist/contracts/TestEscrowFactory.sol/TestEscrowFactory.json"),
        "utf8"
      )
    );

    const resolverJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "dist/contracts/Resolver.sol/Resolver.json"),
        "utf8"
      )
    );

    const mockTokenJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "dist/contracts/MockToken.sol/MockToken.json"),
        "utf8"
      )
    );

    // Use existing mock tokens as fee tokens
    const deployments = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "crosschain_deployments.json"), "utf8")
    );
    
    const chainKey = chainName.toLowerCase().replace(" ", "_");
    const feeToken = deployments[chainKey]?.mockUSDT || ethers.ZeroAddress;

    // Deploy TestEscrowFactory
    console.log("[Deploy] Deploying TestEscrowFactory...");
    const EscrowFactoryFactory = new ethers.ContractFactory(
      escrowFactoryJson.abi,
      escrowFactoryJson.bytecode.object,
      deployer
    );

    const escrowFactory = await EscrowFactoryFactory.deploy(
      LIMIT_ORDER_PROTOCOL,
      feeToken, // Fee token (using USDT)
      ACCESS_TOKEN, // Access token (zero for testing)
      deployer.address, // Owner
      RESCUE_DELAY, // Source rescue delay
      RESCUE_DELAY  // Destination rescue delay
    );
    await escrowFactory.waitForDeployment();
    const escrowFactoryAddress = await escrowFactory.getAddress();
    console.log(`[Deploy] TestEscrowFactory deployed at: ${escrowFactoryAddress}`);

    // Deploy Resolver
    console.log("[Deploy] Deploying Resolver...");
    const ResolverFactory = new ethers.ContractFactory(
      resolverJson.abi,
      resolverJson.bytecode.object,
      deployer
    );

    const resolver = await ResolverFactory.deploy(
      escrowFactoryAddress,
      LIMIT_ORDER_PROTOCOL,
      deployer.address // Initial owner
    );
    await resolver.waitForDeployment();
    const resolverAddress = await resolver.getAddress();
    console.log(`[Deploy] Resolver deployed at: ${resolverAddress}`);

    return {
      chain: chainName,
      escrowFactory: escrowFactoryAddress,
      resolver: resolverAddress,
      limitOrderProtocol: LIMIT_ORDER_PROTOCOL,
      mockUSDT: deployments[chainKey]?.mockUSDT,
      mockLINK: deployments[chainKey]?.mockLINK
    };

  } catch (error) {
    console.error(`[Deploy] Error on ${chainName}:`, error);
    return null;
  }
}

async function main() {
  console.log("[Deploy] Starting cross-chain infrastructure deployment...");

  // Build contracts
  console.log("[Deploy] Building contracts...");
  const { execSync } = await import("child_process");
  execSync("forge build", { stdio: "inherit" });

  const deployments: any = {};

  // Deploy on Ethereum Sepolia
  const ethDeployment = await deployOnChain(
    "Ethereum Sepolia",
    `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );
  if (ethDeployment) deployments.ethereum_sepolia = ethDeployment;

  // Deploy on Base Sepolia
  const baseDeployment = await deployOnChain(
    "Base Sepolia",
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );
  if (baseDeployment) deployments.base_sepolia = baseDeployment;

  // Save deployment info
  const deploymentPath = path.join(process.cwd(), "escrow_deployments.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log(`\n[Deploy] Deployment info saved to: ${deploymentPath}`);

  // Print summary
  console.log("\n[Deploy] ========== DEPLOYMENT SUMMARY ==========");
  for (const [chain, info] of Object.entries(deployments)) {
    console.log(`\n${chain}:`);
    console.log(`  EscrowFactory: ${(info as any).escrowFactory}`);
    console.log(`  Resolver: ${(info as any).resolver}`);
    console.log(`  LimitOrderProtocol: ${(info as any).limitOrderProtocol}`);
  }
}

main().catch(error => {
  console.error("[Deploy] Fatal error:", error);
  process.exit(1);
});