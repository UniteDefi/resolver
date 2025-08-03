import { Wallet } from "xrpl";
import * as fs from "fs";
import * as path from "path";

function generateXRPLWallets() {
  console.log("🔐 Generating XRPL Wallets...\n");

  // Generate wallets
  const deployerWallet = Wallet.generate();
  const userWallet = Wallet.generate();
  const resolver0 = Wallet.generate();
  const resolver1 = Wallet.generate();
  const resolver2 = Wallet.generate();
  const resolver3 = Wallet.generate();

  // Display generated wallets
  console.log("📝 Generated Wallets:");
  console.log(`Deployer: ${deployerWallet.address}`);
  console.log(`   Secret: ${deployerWallet.seed}`);
  console.log(`User: ${userWallet.address}`);
  console.log(`   Secret: ${userWallet.seed}`);
  console.log(`Resolver0: ${resolver0.address}`);
  console.log(`   Secret: ${resolver0.seed}`);
  console.log(`Resolver1: ${resolver1.address}`);
  console.log(`   Secret: ${resolver1.seed}`);
  console.log(`Resolver2: ${resolver2.address}`);
  console.log(`   Secret: ${resolver2.seed}`);
  console.log(`Resolver3: ${resolver3.address}`);
  console.log(`   Secret: ${resolver3.seed}`);

  // Copy EVM keys from Aptos .env
  const evmKeys = {
    BASE_SEPOLIA_RPC_URL: "https://base-sepolia.g.alchemy.com/v2/9MExjLYju7RbwL5KDizzG",
    BASE_SEPOLIA_CHAIN_ID: "84532",
    RESOLVER_PRIVATE_KEY_0: "0x1d7c3f21a7c7b6531706cecc277dfe7df892f0fc401c8a298ead1dc23928cc58",
    RESOLVER_WALLET_0: "0x875eF470dffF58acd5903c704DB65D50022eA994",
    RESOLVER_PRIVATE_KEY_1: "0xce9b4305041da2dd6cc9abbe33e693f0ffe644338226b5a3ae3279e39cecf6d3",
    RESOLVER_WALLET_1: "0x24a330C62b739f1511Ec3D41cbfDA5fCc4DD6Ae6",
    RESOLVER_PRIVATE_KEY_2: "0xeff69b72e73c936cfd76bcba676ae5365a8a5efe28d3d71cf4eaffc79b2456ce",
    RESOLVER_WALLET_2: "0x6e90aB122b10fEad2cAc61c3d362B658d56a273f",
    RESOLVER_PRIVATE_KEY_3: "0x28885f9663a5c063c15a618eef72218a552a8f30aed01fb84e66b01b1b9ba2a7",
    RESOLVER_WALLET_3: "0x62181aDd17d4b6C7303b26CE6f9A3668835c0E51",
    DEPLOYER_ADDRESS: "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35",
    DEPLOYER_PRIVATE_KEY: "0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3",
    TEST_USER_PRIVATE_KEY: "0xfa5aaf38f4e19824782bea1d02a1ccfd192daa89ceb1741de3dcb77e652b1eee",
    TEST_USER_ADDRESS: "0x6B9ad963c764a06A7ef8ff96D38D0cB86575eC00"
  };

  // Create .env content
  const envContent = `# XRPL Network Configuration
XRPL_NETWORK=testnet
XRPL_SERVER_URL=wss://s.altnet.rippletest.net:51233

# Deployer/Relayer Wallet
XRPL_DEPLOYER_SECRET=${deployerWallet.seed}
XRPL_DEPLOYER_ADDRESS=${deployerWallet.address}

# User Wallet
XRPL_USER_SECRET=${userWallet.seed}
XRPL_USER_ADDRESS=${userWallet.address}

# Resolver Wallets
XRPL_RESOLVER_SECRET_0=${resolver0.seed}
XRPL_RESOLVER_ADDRESS_0=${resolver0.address}

XRPL_RESOLVER_SECRET_1=${resolver1.seed}
XRPL_RESOLVER_ADDRESS_1=${resolver1.address}

XRPL_RESOLVER_SECRET_2=${resolver2.seed}
XRPL_RESOLVER_ADDRESS_2=${resolver2.address}

XRPL_RESOLVER_SECRET_3=${resolver3.seed}
XRPL_RESOLVER_ADDRESS_3=${resolver3.address}

# Cross-chain Configuration (for testing with EVM chains)
# Base Sepolia Configuration
BASE_SEPOLIA_RPC_URL=${evmKeys.BASE_SEPOLIA_RPC_URL}
BASE_SEPOLIA_CHAIN_ID=${evmKeys.BASE_SEPOLIA_CHAIN_ID}

# EVM Wallet Keys for Cross-Chain Testing (Base Sepolia)
RESOLVER_PRIVATE_KEY_0=${evmKeys.RESOLVER_PRIVATE_KEY_0}
RESOLVER_WALLET_0=${evmKeys.RESOLVER_WALLET_0}

RESOLVER_PRIVATE_KEY_1=${evmKeys.RESOLVER_PRIVATE_KEY_1}
RESOLVER_WALLET_1=${evmKeys.RESOLVER_WALLET_1}

RESOLVER_PRIVATE_KEY_2=${evmKeys.RESOLVER_PRIVATE_KEY_2}
RESOLVER_WALLET_2=${evmKeys.RESOLVER_WALLET_2}

RESOLVER_PRIVATE_KEY_3=${evmKeys.RESOLVER_PRIVATE_KEY_3}
RESOLVER_WALLET_3=${evmKeys.RESOLVER_WALLET_3}

# Base Sepolia Deployer & Test Addresses
DEPLOYER_ADDRESS=${evmKeys.DEPLOYER_ADDRESS}
DEPLOYER_PRIVATE_KEY=${evmKeys.DEPLOYER_PRIVATE_KEY}

TEST_USER_PRIVATE_KEY=${evmKeys.TEST_USER_PRIVATE_KEY}
TEST_USER_ADDRESS=${evmKeys.TEST_USER_ADDRESS}
`;

  // Write .env file
  const envPath = path.join(__dirname, "../.env");
  fs.writeFileSync(envPath, envContent);

  console.log("\n✅ .env file created successfully!");
  console.log(`📁 Location: ${envPath}`);
  
  console.log("\n🚨 IMPORTANT: Fund the deployer wallet first!");
  console.log(`💰 Deployer Address: ${deployerWallet.address}`);
  console.log("🌐 Testnet Faucet: https://xrpl.org/xrp-testnet-faucet.html");
  console.log("💵 Recommended amount: 10,000+ XRP for testing");

  return deployerWallet.address;
}

// Run if called directly
if (require.main === module) {
  const deployerAddress = generateXRPLWallets();
  console.log(`\n🎯 DEPLOYER ADDRESS TO FUND: ${deployerAddress}`);
}

export { generateXRPLWallets };