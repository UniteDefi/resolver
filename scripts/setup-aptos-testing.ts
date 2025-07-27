#!/usr/bin/env tsx

import { 
  Account, 
  Ed25519PrivateKey,
  Aptos,
  AptosConfig,
  Network
} from "@aptos-labs/ts-sdk";
import { writeFileSync, existsSync } from "fs";
import { join } from "path";

async function setupAptosAccounts() {
  console.log("🚀 Setting up Aptos accounts for testing...");
  
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  // Generate test accounts
  const deployer = Account.generate();
  const user = Account.generate(); 
  const resolver = Account.generate();
  
  console.log("\n📝 Generated Accounts:");
  console.log(`Deployer: ${deployer.accountAddress}`);
  console.log(`User: ${user.accountAddress}`);
  console.log(`Resolver: ${resolver.accountAddress}`);
  
  // Fund accounts from faucet
  console.log("\n💰 Funding accounts from faucet...");
  
  try {
    await aptos.fundAccount({
      accountAddress: deployer.accountAddress,
      amount: 100_000_000 // 1 APT
    });
    console.log(`✅ Funded deployer: ${deployer.accountAddress}`);
    
    await aptos.fundAccount({
      accountAddress: user.accountAddress,
      amount: 100_000_000
    });
    console.log(`✅ Funded user: ${user.accountAddress}`);
    
    await aptos.fundAccount({
      accountAddress: resolver.accountAddress,
      amount: 100_000_000
    });
    console.log(`✅ Funded resolver: ${resolver.accountAddress}`);
    
  } catch (error) {
    console.error("❌ Error funding accounts:", error);
    return;
  }
  
  // Create .env file
  const envContent = `# Aptos Configuration
APTOS_NODE_URL=https://fullnode.testnet.aptoslabs.com/v1
APTOS_FAUCET_URL=https://faucet.testnet.aptoslabs.com
APTOS_INDEXER_URL=https://indexer-testnet.staging.gcp.aptosdev.com/v1/graphql

# Base Sepolia Configuration
BASE_SEPOLIA_RPC=https://sepolia.base.org
BASE_ESCROW_FACTORY=0x... # Deploy and add address
BASE_DUTCH_AUCTION=0x... # Deploy and add address

# Test Account Private Keys (TESTNET ONLY - DO NOT USE IN PRODUCTION)
APTOS_DEPLOYER_KEY=${deployer.privateKey.toString()}
APTOS_USER_KEY=${user.privateKey.toString()}
APTOS_RESOLVER_KEY=${resolver.privateKey.toString()}

# Ethereum/Base Private Keys (TESTNET ONLY)
ETH_DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ETH_USER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
ETH_RESOLVER_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

# Optional: Enable fork mode for testing
CREATE_FORK=false`;

  const envPath = join(process.cwd(), ".env");
  
  if (existsSync(envPath)) {
    console.log("\n⚠️  .env file already exists. Creating .env.generated instead");
    writeFileSync(join(process.cwd(), ".env.generated"), envContent);
    console.log("✅ Created .env.generated file");
  } else {
    writeFileSync(envPath, envContent);
    console.log("✅ Created .env file");
  }
  
  // Show next steps
  console.log("\n🎯 Next Steps:");
  console.log("1. Deploy Move modules to Aptos testnet:");
  console.log("   cd test/aptos && aptos move publish --profile testnet");
  console.log("");
  console.log("2. Deploy contracts to Base Sepolia (if needed)");
  console.log("");
  console.log("3. Update .env with deployed contract addresses");
  console.log("");
  console.log("4. Run tests:");
  console.log("   yarn test tests/aptos/main-integration.spec.ts");
}

async function checkBalance(address: string): Promise<number> {
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  try {
    const balance = await aptos.getAccountAPTAmount({
      accountAddress: address
    });
    return balance;
  } catch {
    return 0;
  }
}

async function main() {
  console.log("🔧 Aptos Testing Setup Script");
  console.log("==============================\n");
  
  await setupAptosAccounts();
}

if (require.main === module) {
  main().catch(console.error);
}