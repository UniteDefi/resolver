import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface WalletInfo {
  address: string;
  privateKey: string;
  publicKey: string;
}

interface GeneratedWallets {
  deployer: WalletInfo;
  user: WalletInfo;
  resolvers: WalletInfo[];
}

function generateWallets(): GeneratedWallets {
  console.log("[Wallet Generation] Starting wallet generation...");

  // Get deployer from existing .env
  const deployerPrivateKey = process.env.APTOS_PRIVATE_KEY;
  if (!deployerPrivateKey) {
    throw new Error("APTOS_PRIVATE_KEY not found in environment variables");
  }

  const deployerAccount = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(deployerPrivateKey),
  });

  const deployer: WalletInfo = {
    address: deployerAccount.accountAddress.toString(),
    privateKey: deployerPrivateKey,
    publicKey: deployerAccount.publicKey.toString(),
  };

  console.log("[Wallet Generation] Deployer/Relayer:");
  console.log("  Address:", deployer.address);

  // Generate user wallet
  const userAccount = Account.generate();
  const user: WalletInfo = {
    address: userAccount.accountAddress.toString(),
    privateKey: userAccount.privateKey.toString(),
    publicKey: userAccount.publicKey.toString(),
  };

  console.log("\n[Wallet Generation] User:");
  console.log("  Address:", user.address);

  // Generate 4 resolver wallets
  const resolvers: WalletInfo[] = [];
  for (let i = 0; i < 4; i++) {
    const resolverAccount = Account.generate();
    const resolver: WalletInfo = {
      address: resolverAccount.accountAddress.toString(),
      privateKey: resolverAccount.privateKey.toString(),
      publicKey: resolverAccount.publicKey.toString(),
    };
    resolvers.push(resolver);

    console.log(`\n[Wallet Generation] Resolver ${i}:`);
    console.log("  Address:", resolver.address);
  }

  return {
    deployer,
    user,
    resolvers,
  };
}

function updateEnvFile(wallets: GeneratedWallets) {
  const envPath = path.join(__dirname, "..", ".env");
  
  // Build new .env content
  const envContent = `# Aptos Network Configuration
APTOS_NETWORK=testnet

# Deployer/Relayer Wallet
APTOS_PRIVATE_KEY=${wallets.deployer.privateKey}
APTOS_DEPLOYER_ADDRESS=${wallets.deployer.address}

# User Wallet
APTOS_USER_PRIVATE_KEY=${wallets.user.privateKey}
APTOS_USER_ADDRESS=${wallets.user.address}

# Resolver Wallets
APTOS_RESOLVER_PRIVATE_KEY_0=${wallets.resolvers[0].privateKey}
APTOS_RESOLVER_ADDRESS_0=${wallets.resolvers[0].address}

APTOS_RESOLVER_PRIVATE_KEY_1=${wallets.resolvers[1].privateKey}
APTOS_RESOLVER_ADDRESS_1=${wallets.resolvers[1].address}

APTOS_RESOLVER_PRIVATE_KEY_2=${wallets.resolvers[2].privateKey}
APTOS_RESOLVER_ADDRESS_2=${wallets.resolvers[2].address}

APTOS_RESOLVER_PRIVATE_KEY_3=${wallets.resolvers[3].privateKey}
APTOS_RESOLVER_ADDRESS_3=${wallets.resolvers[3].address}
`;

  fs.writeFileSync(envPath, envContent);
  console.log("\n[Wallet Generation] Updated .env file");
}

function saveWalletsToJson(wallets: GeneratedWallets) {
  const walletsPath = path.join(__dirname, "..", "wallets.json");
  
  const walletsData = {
    network: process.env.APTOS_NETWORK || "testnet",
    generatedAt: new Date().toISOString(),
    wallets: {
      deployer: wallets.deployer,
      user: wallets.user,
      resolvers: wallets.resolvers.map((r, i) => ({
        index: i,
        ...r,
      })),
    },
  };

  fs.writeFileSync(walletsPath, JSON.stringify(walletsData, null, 2));
  console.log("[Wallet Generation] Saved wallet details to wallets.json");
}

// Run if called directly
if (require.main === module) {
  try {
    const wallets = generateWallets();
    updateEnvFile(wallets);
    saveWalletsToJson(wallets);
    
    console.log("\n[Wallet Generation] ✅ Wallet generation complete!");
    console.log("[Wallet Generation] Please fund these wallets with APT before deployment");
    console.log("[Wallet Generation] Recommended amounts:");
    console.log("  - Deployer: Already has ~5 APT");
    console.log("  - User: 1 APT");
    console.log("  - Each Resolver: 0.5 APT");
  } catch (error) {
    console.error("[Wallet Generation] ❌ Error:", error);
    process.exit(1);
  }
}

export { generateWallets };