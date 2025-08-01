import { KeyPair, keyStores, connect } from "near-api-js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

config();

interface WalletCredentials {
  accountId: string;
  publicKey: string;
  privateKey: string;
  seedPhrase?: string;
}

async function generateWallet(): Promise<WalletCredentials> {
  console.log("[WalletGen] Generating new NEAR testnet wallet...");
  
  // Generate a unique account name with timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  const accountId = `unite-defi-test-${timestamp}.testnet`;
  
  // Generate new KeyPair
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString();
  const privateKey = keyPair.toString();
  
  console.log(`[WalletGen] Generated account ID: ${accountId}`);
  console.log(`[WalletGen] Public key: ${publicKey}`);
  
  return {
    accountId,
    publicKey,
    privateKey,
  };
}

async function saveCredentials(credentials: WalletCredentials): Promise<void> {
  console.log("[WalletGen] Saving credentials...");
  
  const networkId = "testnet";
  const homeDir = process.env.HOME;
  
  if (!homeDir) {
    throw new Error("HOME environment variable not found");
  }
  
  // Create .near-credentials directory structure
  const credentialsDir = join(homeDir, ".near-credentials", networkId);
  
  if (!existsSync(credentialsDir)) {
    mkdirSync(credentialsDir, { recursive: true });
    console.log(`[WalletGen] Created credentials directory: ${credentialsDir}`);
  }
  
  // Save credentials in NEAR format
  const credentialData = {
    account_id: credentials.accountId,
    public_key: credentials.publicKey,
    private_key: credentials.privateKey,
  };
  
  const credentialPath = join(credentialsDir, `${credentials.accountId}.json`);
  writeFileSync(credentialPath, JSON.stringify(credentialData, null, 2));
  
  console.log(`[WalletGen] Saved credentials to: ${credentialPath}`);
}

async function updateEnvFile(credentials: WalletCredentials): Promise<void> {
  console.log("[WalletGen] Updating .env file...");
  
  const envPath = join(__dirname, "../.env");
  const contractName = `counter.${credentials.accountId}`;
  
  const envContent = `# NEAR Network Configuration
NEAR_NETWORK_ID=testnet
NEAR_NODE_URL=https://rpc.testnet.near.org

# Account Configuration
NEAR_MASTER_ACCOUNT=${credentials.accountId}
NEAR_CONTRACT_NAME=${contractName}
NEAR_ACCOUNT_ID=${credentials.accountId}

# Generated on: ${new Date().toISOString()}
# Public Key: ${credentials.publicKey}

# Optional: Custom RPC endpoints
# NEAR_NODE_URL=https://rpc.mainnet.near.org  # For mainnet
# NEAR_NETWORK_ID=mainnet  # For mainnet deployment
`;
  
  writeFileSync(envPath, envContent);
  console.log(`[WalletGen] Updated .env file with new account details`);
}

async function testConnection(credentials: WalletCredentials): Promise<void> {
  console.log("[WalletGen] Testing connection to NEAR testnet...");
  
  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    join(process.env.HOME || "", ".near-credentials")
  );
  
  const near = await connect({
    networkId: "testnet",
    keyStore,
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
  });
  
  try {
    // This will throw if account doesn't exist, which is expected for new accounts
    await near.account(credentials.accountId);
    console.log(`[WalletGen] Account exists on testnet`);
  } catch (error: any) {
    if (error.type === "AccountDoesNotExist") {
      console.log(`[WalletGen] Account doesn't exist yet (expected for new accounts)`);
    } else {
      console.warn(`[WalletGen] Connection test warning:`, error.message);
    }
  }
}

async function generateTestnetWallet(): Promise<void> {
  try {
    console.log("[WalletGen] Starting NEAR testnet wallet generation...");
    
    // Generate new wallet
    const credentials = await generateWallet();
    
    // Save credentials to .near-credentials
    await saveCredentials(credentials);
    
    // Update .env file
    await updateEnvFile(credentials);
    
    // Test connection
    await testConnection(credentials);
    
    console.log("\n" + "=".repeat(80));
    console.log("🎉 NEAR TESTNET WALLET GENERATED SUCCESSFULLY!");
    console.log("=".repeat(80));
    console.log(`Account ID: ${credentials.accountId}`);
    console.log(`Public Key: ${credentials.publicKey}`);
    console.log(`Network: testnet`);
    console.log("");
    console.log("📋 NEXT STEPS:");
    console.log("1. Fund your account at: https://wallet.testnet.near.org/");
    console.log("2. Or use the testnet faucet to get free NEAR tokens");
    console.log(`3. View your account: https://explorer.testnet.near.org/accounts/${credentials.accountId}`);
    console.log("");
    console.log("💰 TO FUND YOUR WALLET:");
    console.log(`   - Visit: https://wallet.testnet.near.org/`);
    console.log(`   - Import your account using the private key`);
    console.log(`   - Or send NEAR tokens to: ${credentials.accountId}`);
    console.log("");
    console.log("🔐 SECURITY:");
    console.log(`   - Private key stored in: ~/.near-credentials/testnet/${credentials.accountId}.json`);
    console.log("   - Keep your private key secure and never share it");
    console.log("   - This is a testnet account - not for mainnet use");
    console.log("=".repeat(80));
    
  } catch (error) {
    console.error("[WalletGen] Error generating wallet:", error);
    process.exit(1);
  }
}

// Run the wallet generation
generateTestnetWallet();