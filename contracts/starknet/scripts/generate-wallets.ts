import { RpcProvider, ec, CallData, hash } from "starknet";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

interface WalletInfo {
  privateKey: string;
  publicKey: string;
  address: string;
  name: string;
}

async function generateStarknetWallets() {
  console.log("🔑 Generating Starknet wallets...");
  
  // Account class hash for OpenZeppelin Account v0.8.1
  const accountClassHash = "0x04c6d6cf894f8bc96bb9c525e6853e5483177841f7388f74a46cfda6f028c755";
  
  const wallets: WalletInfo[] = [];
  
  // Generate wallets
  const walletNames = [
    "Deployer",
    "User", 
    "Resolver0",
    "Resolver1", 
    "Resolver2",
    "Resolver3"
  ];
  
  for (const name of walletNames) {
    console.log(`   Generating ${name} wallet...`);
    
    // Generate valid private key for Stark curve
    // The private key must be less than the curve order
    let privateKey: string;
    let publicKey: string;
    
    do {
      const randomBytes = crypto.randomBytes(31); // Use 31 bytes to ensure we're under the curve order
      privateKey = "0x" + randomBytes.toString("hex");
      try {
        publicKey = ec.starkCurve.getStarkKey(privateKey);
        break;
      } catch (error) {
        // Retry if key is invalid
        continue;
      }
    } while (true);
    
    // Calculate account address using OpenZeppelin Account pattern
    const constructorCalldata = CallData.compile([publicKey]);
    
    const address = hash.calculateContractAddressFromHash(
      publicKey, // salt (using public key as salt)
      accountClassHash,
      constructorCalldata,
      0 // deployer address (0 for account contracts)
    );
    
    wallets.push({
      privateKey,
      publicKey,
      address,
      name
    });
    
    console.log(`   ✅ ${name}: ${address}`);
  }
  
  // Display all generated wallets
  console.log("\n📋 Generated Wallets:");
  wallets.forEach(wallet => {
    console.log(`\n${wallet.name}:`);
    console.log(`  Address:     ${wallet.address}`);
    console.log(`  Private Key: ${wallet.privateKey}`);
    console.log(`  Public Key:  ${wallet.publicKey}`);
  });
  
  // Save wallet info
  const walletData = {
    network: "starknet-sepolia",
    generatedAt: new Date().toISOString(),
    accountClassHash,
    wallets: wallets.reduce((acc, wallet) => {
      acc[wallet.name.toLowerCase()] = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey
      };
      return acc;
    }, {} as any)
  };
  
  // Save to wallet-info.json
  const walletInfoPath = path.join(__dirname, "..", "wallet-info.json");
  fs.writeFileSync(walletInfoPath, JSON.stringify(walletData, null, 2));
  
  console.log("\n💾 Wallet information saved to wallet-info.json");
  
  // Return deployer address for funding
  const deployerWallet = wallets.find(w => w.name === "Deployer")!;
  
  console.log("\n🎯 NEXT STEPS:");
  console.log("1. Fund the deployer wallet with ETH on Starknet Sepolia:");
  console.log(`   Deployer Address: ${deployerWallet.address}`);
  console.log("   Faucets:");
  console.log("   - https://faucet.starknet.io/");
  console.log("   - https://starknet-faucet.vercel.app/");
  console.log("\n2. Run 'npm run update-env' to update .env with generated wallets");
  console.log("3. After funding, run 'npm run deploy' to deploy contracts");
  
  return deployerWallet.address;
}

if (require.main === module) {
  generateStarknetWallets().catch(console.error);
}

export default generateStarknetWallets;