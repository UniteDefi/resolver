import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const CHAINS = {
  ethereum_sepolia: {
    name: "Ethereum Sepolia",
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  },
  base_sepolia: {
    name: "Base Sepolia", 
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  },
  polygon_amoy: {
    name: "Polygon Amoy",
    rpcUrl: `https://polygon-amoy.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  },
  arbitrum_sepolia: {
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  },
};

async function checkBalances() {
  console.log("[Balance Check] Checking wallet balances across all chains...\n");
  
  // Get wallets
  const wallets = [
    { name: "Funder", key: process.env.PRIVATE_KEY },
    { name: "Seller", key: process.env.SELLER_WALLET_PRIVATE_KEY },
    { name: "Resolver1", key: process.env.RESOLVER1_WALLET_PRIVATE_KEY },
    { name: "Resolver2", key: process.env.RESOLVER2_WALLET_PRIVATE_KEY },
    { name: "Resolver3", key: process.env.RESOLVER3_WALLET_PRIVATE_KEY },
    { name: "Resolver4", key: process.env.RESOLVER4_WALLET_PRIVATE_KEY },
  ];
  
  // Check which wallets are configured
  const configuredWallets = wallets.filter(w => w.key);
  console.log(`Found ${configuredWallets.length} configured wallets\n`);
  
  // Check balances on each chain
  for (const [chainId, config] of Object.entries(CHAINS)) {
    console.log(`\n${config.name}:`);
    console.log("=".repeat(50));
    
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      
      for (const wallet of configuredWallets) {
        if (wallet.key) {
          const address = new ethers.Wallet(wallet.key).address;
          const balance = await provider.getBalance(address);
          
          console.log(
            `${wallet.name.padEnd(10)} ${address} : ${ethers.formatEther(balance)} ETH`
          );
        }
      }
    } catch (error) {
      console.error(`Error checking ${config.name}:`, error);
    }
  }
  
  // Check token balances on Base Sepolia if deployment exists
  try {
    const fs = await import("fs");
    const path = await import("path");
    
    const deploymentPath = path.join(process.cwd(), "deployments_base_sepolia.json");
    if (fs.existsSync(deploymentPath)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
      
      console.log("\n\nBase Sepolia Token Balances:");
      console.log("=".repeat(50));
      
      const provider = new ethers.JsonRpcProvider(CHAINS.base_sepolia.rpcUrl);
      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
      ];
      
      const usdtContract = new ethers.Contract(deployment.mockUSDT, ERC20_ABI, provider);
      const linkContract = new ethers.Contract(deployment.mockLINK, ERC20_ABI, provider);
      
      for (const wallet of configuredWallets) {
        if (wallet.key) {
          const address = new ethers.Wallet(wallet.key).address;
          
          const usdtBalance = await usdtContract.balanceOf(address);
          const linkBalance = await linkContract.balanceOf(address);
          
          console.log(`${wallet.name.padEnd(10)} ${address}:`);
          console.log(`  mUSDT: ${ethers.formatUnits(usdtBalance, 6)}`);
          console.log(`  mLINK: ${ethers.formatUnits(linkBalance, 18)}`);
        }
      }
    }
  } catch (error) {
    // Ignore if no deployment file
  }
}

// Run if called directly
if (require.main === module) {
  checkBalances().catch((error) => {
    console.error("[Balance Check] Error:", error);
    process.exit(1);
  });
}

export { checkBalances };