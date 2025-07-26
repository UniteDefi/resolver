import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const CHAIN_CONFIGS: Record<string, { rpcUrl: string; chainId: number }> = {
  base_sepolia: {
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 84532,
  },
  ethereum_sepolia: {
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 11155111,
  },
  polygon_amoy: {
    rpcUrl: `https://polygon-amoy.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 80002,
  },
  arbitrum_sepolia: {
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 421614,
  },
};

// MockToken ABI (simplified)
const MOCK_TOKEN_ABI = [
  "constructor(string name, string symbol, uint8 decimals)",
  "function mint(address to, uint256 amount)",
  "function mintToMultiple(address[] recipients, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)"
];


async function deployTestTokens() {
  if (!process.env.PRIVATE_KEY) {
    console.error("[Deploy] Error: PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log("[Deploy] Deploying from:", deployer.address);

  // Get test wallets
  const testWallets = [
    process.env.SELLER_WALLET_PRIVATE_KEY,
    process.env.RESOLVER1_WALLET_PRIVATE_KEY,
    process.env.RESOLVER2_WALLET_PRIVATE_KEY,
    process.env.RESOLVER3_WALLET_PRIVATE_KEY,
    process.env.RESOLVER4_WALLET_PRIVATE_KEY,
  ].filter(Boolean).map(pk => new ethers.Wallet(pk!).address);

  console.log("[Deploy] Will mint tokens to:", testWallets);

  const chain = process.env.DEPLOY_CHAIN || "base_sepolia";
  const config = CHAIN_CONFIGS[chain];
  
  if (!config) {
    console.error(`[Deploy] Unknown chain: ${chain}`);
    process.exit(1);
  }

  console.log(`[Deploy] Deploying to ${chain}...`);
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = deployer.connect(provider);

  try {
    // Read compiled bytecode
    const mockTokenJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "out/MockToken.sol/MockToken.json"),
        "utf8"
      )
    );

    const MockTokenFactory = new ethers.ContractFactory(
      mockTokenJson.abi,
      mockTokenJson.bytecode.object,
      signer
    );

    // Deploy MockUSDT
    console.log("\n[Deploy] Deploying MockUSDT...");
    const mockUSDT = await MockTokenFactory.deploy("Mock USDT", "mUSDT", 6);
    await mockUSDT.waitForDeployment();
    const usdtAddress = await mockUSDT.getAddress();
    console.log("[Deploy] MockUSDT deployed at:", usdtAddress);

    // Deploy MockLINK
    console.log("\n[Deploy] Deploying MockLINK...");
    const mockLINK = await MockTokenFactory.deploy("Mock LINK", "mLINK", 18);
    await mockLINK.waitForDeployment();
    const linkAddress = await mockLINK.getAddress();
    console.log("[Deploy] MockLINK deployed at:", linkAddress);

    // Mint tokens to test wallets
    console.log("\n[Deploy] Minting tokens to test wallets...");
    
    // Mint 10,000 USDT to each wallet
    const usdtAmount = ethers.parseUnits("10000", 6);
    console.log("[Deploy] Minting 10,000 mUSDT to each wallet...");
    const mintUsdtTx = await mockUSDT.mintToMultiple(testWallets, usdtAmount);
    await mintUsdtTx.wait();
    console.log("[Deploy] mUSDT minted!");

    // Mint 100 LINK to each wallet
    const linkAmount = ethers.parseEther("100");
    console.log("[Deploy] Minting 100 mLINK to each wallet...");
    const mintLinkTx = await mockLINK.mintToMultiple(testWallets, linkAmount);
    await mintLinkTx.wait();
    console.log("[Deploy] mLINK minted!");

    // Save deployment info
    const deploymentInfo = {
      chain,
      timestamp: new Date().toISOString(),
      mockUSDT: usdtAddress,
      mockLINK: linkAddress,
      testWallets,
    };

    const deploymentPath = path.join(process.cwd(), `deployments_${chain}.json`);
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n[Deploy] Deployment info saved to: ${deploymentPath}`);

    console.log("\n[Deploy] Add these to your .env file:");
    console.log(`${chain.toUpperCase()}_MOCK_USDT=${usdtAddress}`);
    console.log(`${chain.toUpperCase()}_MOCK_LINK=${linkAddress}`);

  } catch (error) {
    console.error("[Deploy] Error:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  deployTestTokens().catch((error) => {
    console.error("[Deploy] Fatal error:", error);
    process.exit(1);
  });
}

export { deployTestTokens };