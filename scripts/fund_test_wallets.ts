import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

interface ChainConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum_sepolia: {
    name: "Ethereum Sepolia",
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 11155111,
  },
  base_sepolia: {
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 84532,
  },
  polygon_amoy: {
    name: "Polygon Amoy",
    rpcUrl: `https://polygon-amoy.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 80002,
  },
  arbitrum_sepolia: {
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    chainId: 421614,
  },
};

const FUNDING_AMOUNT = ethers.parseEther("0.05");

async function getWalletFromEnv(envKey: string): Promise<{ privateKey: string; address: string } | null> {
  const envPrivateKey = process.env[envKey];
  
  if (!envPrivateKey || envPrivateKey.trim() === "") {
    return null;
  }
  
  try {
    const wallet = new ethers.Wallet(envPrivateKey);
    return {
      privateKey: envPrivateKey,
      address: wallet.address,
    };
  } catch (error) {
    console.error(`[FundWallets] Invalid private key for ${envKey}`);
    return null;
  }
}

async function fundWallets() {
  // Check required environment variables
  if (!process.env.PRIVATE_KEY) {
    console.error("[FundWallets] Error: PRIVATE_KEY not set in .env");
    process.exit(1);
  }
  
  if (!process.env.ALCHEMY_API_KEY) {
    console.error("[FundWallets] Error: ALCHEMY_API_KEY not set in .env");
    process.exit(1);
  }
  
  const fundingWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log("[FundWallets] Funding from wallet:", fundingWallet.address);
  
  // Get test wallets from environment
  const walletKeys = [
    "SELLER_WALLET_PRIVATE_KEY",
    "RESOLVER1_WALLET_PRIVATE_KEY",
    "RESOLVER2_WALLET_PRIVATE_KEY",
    "RESOLVER3_WALLET_PRIVATE_KEY",
    "RESOLVER4_WALLET_PRIVATE_KEY",
  ];
  
  const testWallets = [];
  for (const key of walletKeys) {
    const wallet = await getWalletFromEnv(key);
    if (!wallet) {
      console.error(`[FundWallets] Error: ${key} not set in .env`);
      console.error("[FundWallets] Run 'npx tsx scripts/generate_random_wallets.ts' to generate new wallets");
      process.exit(1);
    }
    testWallets.push(wallet);
  }
  
  const walletNames = ["Seller", "Resolver1", "Resolver2", "Resolver3", "Resolver4"];
  
  // Display wallet information
  console.log("\n[FundWallets] Test wallets to fund:");
  testWallets.forEach((wallet, index) => {
    console.log(`  ${walletNames[index]}: ${wallet.address}`);
  });
  
  // Get chains to fund
  const chains = process.env.TEST_CHAINS?.split(",") || ["ethereum_sepolia"];
  
  // Fund wallets on each chain
  for (const chainId of chains) {
    const config = CHAIN_CONFIGS[chainId];
    if (!config) {
      console.error(`[FundWallets] Unknown chain: ${chainId}`);
      continue;
    }
    
    console.log(`\n[FundWallets] Funding wallets on ${config.name}...`);
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signer = fundingWallet.connect(provider);
    
    // Check funding wallet balance
    const balance = await provider.getBalance(fundingWallet.address);
    const requiredBalance = FUNDING_AMOUNT * BigInt(testWallets.length);
    
    if (balance < requiredBalance) {
      console.error(`[FundWallets] Insufficient balance on ${config.name}`);
      console.error(`  Current balance: ${ethers.formatEther(balance)} ETH`);
      console.error(`  Required balance: ${ethers.formatEther(requiredBalance)} ETH`);
      continue;
    }
    
    // Fund each test wallet
    for (let i = 0; i < testWallets.length; i++) {
      const testWallet = testWallets[i];
      const walletName = walletNames[i];
      
      try {
        // Check current balance
        const currentBalance = await provider.getBalance(testWallet.address);
        
        if (currentBalance >= FUNDING_AMOUNT) {
          console.log(`[FundWallets] ${walletName} already has sufficient balance: ${ethers.formatEther(currentBalance)} ETH`);
          continue;
        }
        
        console.log(`[FundWallets] Funding ${walletName} (${testWallet.address})...`);
        
        const tx = await signer.sendTransaction({
          to: testWallet.address,
          value: FUNDING_AMOUNT,
        });
        
        console.log(`[FundWallets] Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`[FundWallets] Transaction confirmed in block ${receipt?.blockNumber}`);
        
      } catch (error) {
        console.error(`[FundWallets] Error funding ${walletName}:`, error);
      }
    }
  }
  
  console.log("\n[FundWallets] Funding complete!");
}

// Run the script
fundWallets().catch((error) => {
  console.error("[FundWallets] Fatal error:", error);
  process.exit(1);
});