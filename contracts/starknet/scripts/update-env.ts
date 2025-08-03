import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load Aptos .env to get EVM keys
const aptosEnvPath = path.join(__dirname, "..", "..", "aptos", ".env");

async function updateEnvFile() {
  console.log("📝 Updating .env file with generated wallets and EVM keys...");
  
  // Read wallet info
  const walletInfoPath = path.join(__dirname, "..", "wallet-info.json");
  if (!fs.existsSync(walletInfoPath)) {
    throw new Error("wallet-info.json not found. Run 'npm run generate-wallets' first.");
  }
  
  const walletData = JSON.parse(fs.readFileSync(walletInfoPath, "utf8"));
  
  // Read Aptos .env for EVM keys
  let aptosEnvContent = "";
  if (fs.existsSync(aptosEnvPath)) {
    aptosEnvContent = fs.readFileSync(aptosEnvPath, "utf8");
    console.log("✅ Found Aptos .env, copying EVM keys...");
  } else {
    console.log("⚠️ Aptos .env not found, will use placeholder values");
  }
  
  // Parse Aptos .env
  const aptosEnv: any = {};
  if (aptosEnvContent) {
    aptosEnvContent.split("\n").forEach(line => {
      const [key, value] = line.split("=");
      if (key && value) {
        aptosEnv[key.trim()] = value.trim();
      }
    });
  }
  
  // Create new .env content
  const envContent = `# Starknet Network Configuration
STARKNET_NETWORK=sepolia
STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io/rpc/v0_7

# Deployer/Relayer Wallet
STARKNET_PRIVATE_KEY=${walletData.wallets.deployer.privateKey}
STARKNET_ACCOUNT_ADDRESS=${walletData.wallets.deployer.address}
STARKNET_PUBLIC_KEY=${walletData.wallets.deployer.publicKey}
STARKNET_ACCOUNT_CLASS_HASH=${walletData.accountClassHash}

# User Wallet
STARKNET_USER_PRIVATE_KEY=${walletData.wallets.user.privateKey}
STARKNET_USER_ADDRESS=${walletData.wallets.user.address}
STARKNET_USER_PUBLIC_KEY=${walletData.wallets.user.publicKey}

# Resolver Wallets
STARKNET_RESOLVER_PRIVATE_KEY_0=${walletData.wallets.resolver0.privateKey}
STARKNET_RESOLVER_WALLET_0=${walletData.wallets.resolver0.address}
STARKNET_RESOLVER_PUBLIC_KEY_0=${walletData.wallets.resolver0.publicKey}

STARKNET_RESOLVER_PRIVATE_KEY_1=${walletData.wallets.resolver1.privateKey}
STARKNET_RESOLVER_WALLET_1=${walletData.wallets.resolver1.address}
STARKNET_RESOLVER_PUBLIC_KEY_1=${walletData.wallets.resolver1.publicKey}

STARKNET_RESOLVER_PRIVATE_KEY_2=${walletData.wallets.resolver2.privateKey}
STARKNET_RESOLVER_WALLET_2=${walletData.wallets.resolver2.address}
STARKNET_RESOLVER_PUBLIC_KEY_2=${walletData.wallets.resolver2.publicKey}

STARKNET_RESOLVER_PRIVATE_KEY_3=${walletData.wallets.resolver3.privateKey}
STARKNET_RESOLVER_WALLET_3=${walletData.wallets.resolver3.address}
STARKNET_RESOLVER_PUBLIC_KEY_3=${walletData.wallets.resolver3.publicKey}

# Cross-chain Configuration (for testing with EVM chains)
# Base Sepolia Configuration
BASE_SEPOLIA_RPC_URL=${aptosEnv.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"}
BASE_SEPOLIA_CHAIN_ID=84532

# EVM Wallet Keys for Cross-Chain Testing (Base Sepolia)
RESOLVER_PRIVATE_KEY_0=${aptosEnv.RESOLVER_PRIVATE_KEY_0 || "your_evm_resolver_0_private_key_here"}
RESOLVER_WALLET_0=${aptosEnv.RESOLVER_WALLET_0 || "your_evm_resolver_0_address_here"}

RESOLVER_PRIVATE_KEY_1=${aptosEnv.RESOLVER_PRIVATE_KEY_1 || "your_evm_resolver_1_private_key_here"}
RESOLVER_WALLET_1=${aptosEnv.RESOLVER_WALLET_1 || "your_evm_resolver_1_address_here"}

RESOLVER_PRIVATE_KEY_2=${aptosEnv.RESOLVER_PRIVATE_KEY_2 || "your_evm_resolver_2_private_key_here"}
RESOLVER_WALLET_2=${aptosEnv.RESOLVER_WALLET_2 || "your_evm_resolver_2_address_here"}

RESOLVER_PRIVATE_KEY_3=${aptosEnv.RESOLVER_PRIVATE_KEY_3 || "your_evm_resolver_3_private_key_here"}
RESOLVER_WALLET_3=${aptosEnv.RESOLVER_WALLET_3 || "your_evm_resolver_3_address_here"}

# Base Sepolia Deployer & Test Addresses
DEPLOYER_ADDRESS=${aptosEnv.DEPLOYER_ADDRESS || "your_base_sepolia_deployer_address_here"}
DEPLOYER_PRIVATE_KEY=${aptosEnv.DEPLOYER_PRIVATE_KEY || "your_base_sepolia_deployer_private_key_here"}

TEST_USER_PRIVATE_KEY=${aptosEnv.TEST_USER_PRIVATE_KEY || "your_base_sepolia_test_user_private_key_here"}
TEST_USER_ADDRESS=${aptosEnv.TEST_USER_ADDRESS || "your_base_sepolia_test_user_address_here"}
`;

  // Write to .env
  const envPath = path.join(__dirname, "..", ".env");
  fs.writeFileSync(envPath, envContent);
  
  console.log("✅ .env file updated successfully!");
  console.log("\n📋 Configuration Summary:");
  console.log(`- Deployer Address: ${walletData.wallets.deployer.address}`);
  console.log(`- User Address: ${walletData.wallets.user.address}`);
  console.log(`- Resolver 0 Address: ${walletData.wallets.resolver0.address}`);
  console.log(`- Resolver 1 Address: ${walletData.wallets.resolver1.address}`);
  console.log(`- Resolver 2 Address: ${walletData.wallets.resolver2.address}`);
  console.log(`- Resolver 3 Address: ${walletData.wallets.resolver3.address}`);
  
  if (aptosEnvContent) {
    console.log("\n✅ EVM keys copied from Aptos configuration");
  } else {
    console.log("\n⚠️ EVM keys not copied - please update manually");
  }
  
  console.log("\n🎯 NEXT STEPS:");
  console.log("1. Fund the deployer wallet with ETH on Starknet Sepolia");
  console.log(`   Deployer Address: ${walletData.wallets.deployer.address}`);
  console.log("2. Run 'npm run deploy' to deploy all contracts");
  console.log("3. Run 'npm run fund' to distribute funds to all wallets");
}

if (require.main === module) {
  updateEnvFile().catch(console.error);
}

export default updateEnvFile;