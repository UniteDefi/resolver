import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load existing .env to preserve settings
dotenv.config();

interface WalletInfo {
  name: string;
  role: string;
  address: string;
  privateKey: string;
}

console.log("🚀 Generating 6 Sui wallets for testing...");
console.log("=".repeat(50));

const wallets: WalletInfo[] = [];

// Generate 6 wallets as requested
const walletRoles = [
  { name: "DEPLOYER", role: "Deployer / Relayer" },
  { name: "USER", role: "Test User" },
  { name: "RESOLVER_1", role: "Resolver 1" },
  { name: "RESOLVER_2", role: "Resolver 2" },
  { name: "RESOLVER_3", role: "Resolver 3" },
  { name: "RESOLVER_4", role: "Resolver 4" }
];

for (const { name, role } of walletRoles) {
  const keypair = new Ed25519Keypair();
  const address = keypair.toSuiAddress();
  const privateKeyBytes = keypair.getSecretKey();
  const privateKey = Buffer.from(privateKeyBytes).toString("hex").slice(0, 64);
  
  wallets.push({ name, role, address, privateKey });
  
  console.log(`\n${role}:`);
  console.log(`  Address: ${address}`);
  console.log(`  Private Key: ${privateKey}`);
}

// Read existing .env content
const envPath = path.join(__dirname, "../.env");
let existingContent = "";
if (fs.existsSync(envPath)) {
  existingContent = fs.readFileSync(envPath, "utf-8");
}

// Preserve existing network configuration but update wallets
const network = process.env.SUI_NETWORK || "testnet";
const rpcUrl = process.env.SUI_RPC_URL || `https://fullnode.${network}.sui.io:443`;

// Update .env with all wallet information
const envContent = `# Sui Network Configuration
SUI_NETWORK=${network}

# RPC Endpoints  
SUI_RPC_URL=${rpcUrl}

# Main Deployer/Relayer Wallet
PRIVATE_KEY=${wallets[0].privateKey}
SUI_PRIVATE_KEY=${wallets[0].privateKey}
ADDRESS=${wallets[0].address}

# Test User Wallet
SUI_TEST_USER_PRIVATE_KEY=${wallets[1].privateKey}
SUI_TEST_USER_ADDRESS=${wallets[1].address}

# Resolver Wallets
SUI_RESOLVER_PRIVATE_KEY_0=${wallets[2].privateKey}
SUI_RESOLVER_ADDRESS_0=${wallets[2].address}

SUI_RESOLVER_PRIVATE_KEY_1=${wallets[3].privateKey}
SUI_RESOLVER_ADDRESS_1=${wallets[3].address}

SUI_RESOLVER_PRIVATE_KEY_2=${wallets[4].privateKey}
SUI_RESOLVER_ADDRESS_2=${wallets[4].address}

SUI_RESOLVER_PRIVATE_KEY_3=${wallets[5].privateKey}
SUI_RESOLVER_ADDRESS_3=${wallets[5].address}

# Contract Addresses (populated after deployment)
ESCROW_FACTORY_ADDRESS=
LIMIT_ORDER_PROTOCOL_ADDRESS=
RESOLVER_ADDRESS=
MOCK_USDC_ADDRESS=

# Demo Configuration
DEMO_RESOLVER_COUNT=4
DEMO_FUNDING_AMOUNT=1000000000

# Cross-chain Configuration (for testing with EVM chains)
# Add your EVM wallet keys here for cross-chain testing
# RESOLVER_PRIVATE_KEY_0=  # EVM resolver 1
# RESOLVER_PRIVATE_KEY_1=  # EVM resolver 2
# RESOLVER_PRIVATE_KEY_2=  # EVM resolver 3
# RESOLVER_PRIVATE_KEY_3=  # EVM resolver 4
# BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
`;

fs.writeFileSync(envPath, envContent);

console.log("\n" + "=".repeat(50));
console.log("✅ All 6 wallets generated successfully!");
console.log("📁 .env file updated with wallet configurations");

console.log("\n📋 Summary:");
wallets.forEach((wallet, index) => {
  console.log(`${index + 1}. ${wallet.role}: ${wallet.address}`);
});

console.log("\n⚠️  Important Notes:");
console.log("1. Keep your private keys secure!");
console.log("2. Fund the deployer wallet with SUI for deployment");
console.log("3. Use testnet faucet: https://faucet.testnet.sui.io");
console.log(`4. Fund deployer address: ${wallets[0].address}`);

console.log("\n🔗 Next Steps:");
console.log("1. Fund the deployer wallet with SUI");
console.log("2. Run: npm run build");
console.log("3. Run: npm run deploy");
console.log("4. Run tests with: npm run test:unit");

// Also save to a separate file for backup
const backupPath = path.join(__dirname, "../wallets-backup.json");
fs.writeFileSync(backupPath, JSON.stringify(wallets, null, 2));
console.log(`\n💾 Wallet backup saved to: ${backupPath}`);