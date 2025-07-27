import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const CHAINS = {
  ethereum_sepolia: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  },
  base_sepolia: {
    name: "Base Sepolia", 
    chainId: 84532,
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  }
};

async function deployOnChain(chainKey: string) {
  const chain = CHAINS[chainKey as keyof typeof CHAINS];
  if (!chain) {
    console.error(`Unknown chain: ${chainKey}`);
    return;
  }

  console.log(`\n[Deploy] Deploying on ${chain.name}...`);

  const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  
  console.log(`[Deploy] Deployer: ${deployer.address}`);
  
  const balance = await provider.getBalance(deployer.address);
  console.log(`[Deploy] Balance: ${ethers.formatEther(balance)} ETH`);

  try {
    // Load ABIs
    const mockTokenJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "dist/contracts/MockToken.sol/MockToken.json"),
        "utf8"
      )
    );

    const auctionJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "dist/contracts/CrossChainTokenAuction.sol/CrossChainTokenAuction.json"),
        "utf8"
      )
    );

    // Deploy MockUSDT
    console.log(`\n[Deploy] Deploying MockUSDT on ${chain.name}...`);
    const MockTokenFactory = new ethers.ContractFactory(
      mockTokenJson.abi,
      mockTokenJson.bytecode.object,
      deployer
    );

    const mockUSDT = await MockTokenFactory.deploy("Mock USDT", "mUSDT", 6);
    await mockUSDT.waitForDeployment();
    const usdtAddress = await mockUSDT.getAddress();
    console.log(`[Deploy] MockUSDT deployed at: ${usdtAddress}`);

    // Deploy MockLINK
    console.log(`\n[Deploy] Deploying MockLINK on ${chain.name}...`);
    const mockLINK = await MockTokenFactory.deploy("Mock LINK", "mLINK", 18);
    await mockLINK.waitForDeployment();
    const linkAddress = await mockLINK.getAddress();
    console.log(`[Deploy] MockLINK deployed at: ${linkAddress}`);

    // Deploy CrossChainTokenAuction
    console.log(`\n[Deploy] Deploying CrossChainTokenAuction on ${chain.name}...`);
    const AuctionFactory = new ethers.ContractFactory(
      auctionJson.abi,
      auctionJson.bytecode.object,
      deployer
    );

    const auction = await AuctionFactory.deploy();
    await auction.waitForDeployment();
    const auctionAddress = await auction.getAddress();
    console.log(`[Deploy] CrossChainTokenAuction deployed at: ${auctionAddress}`);

    // Mint tokens to test wallets
    const testWallets = [
      process.env.SELLER_WALLET_PRIVATE_KEY,
      process.env.RESOLVER1_WALLET_PRIVATE_KEY,
      process.env.RESOLVER2_WALLET_PRIVATE_KEY,
      process.env.RESOLVER3_WALLET_PRIVATE_KEY,
    ].filter(Boolean).map(pk => new ethers.Wallet(pk!).address);

    console.log(`\n[Deploy] Minting tokens to ${testWallets.length} test wallets...`);
    
    // Mint 10,000 USDT to each
    const usdtAmount = ethers.parseUnits("10000", 6);
    const mintUsdtTx = await mockUSDT.mintToMultiple(testWallets, usdtAmount);
    await mintUsdtTx.wait();
    console.log(`[Deploy] Minted 10,000 mUSDT to each wallet`);

    // Mint 100 LINK to each
    const linkAmount = ethers.parseEther("100");
    const mintLinkTx = await mockLINK.mintToMultiple(testWallets, linkAmount);
    await mintLinkTx.wait();
    console.log(`[Deploy] Minted 100 mLINK to each wallet`);

    return {
      chain: chainKey,
      chainId: chain.chainId,
      mockUSDT: usdtAddress,
      mockLINK: linkAddress,
      auctionContract: auctionAddress,
      testWallets,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`[Deploy] Error on ${chain.name}:`, error);
    return null;
  }
}

async function main() {
  console.log("[Deploy] Starting cross-chain deployment...");

  // First compile if needed
  console.log("[Deploy] Building contracts...");
  const { execSync } = await import("child_process");
  execSync("forge build", { stdio: "inherit" });

  const deployments: any = {};

  // Deploy on both chains
  for (const chainKey of Object.keys(CHAINS)) {
    const result = await deployOnChain(chainKey);
    if (result) {
      deployments[chainKey] = result;
    }
  }

  // Save deployment info
  const deploymentPath = path.join(process.cwd(), "crosschain_deployments.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log(`\n[Deploy] Deployment info saved to: ${deploymentPath}`);

  // Print summary
  console.log("\n[Deploy] ========== DEPLOYMENT SUMMARY ==========");
  for (const [chain, info] of Object.entries(deployments)) {
    console.log(`\n${chain}:`);
    console.log(`  MockUSDT: ${(info as any).mockUSDT}`);
    console.log(`  MockLINK: ${(info as any).mockLINK}`);
    console.log(`  Auction: ${(info as any).auctionContract}`);
  }
}

main().catch(error => {
  console.error("[Deploy] Fatal error:", error);
  process.exit(1);
});