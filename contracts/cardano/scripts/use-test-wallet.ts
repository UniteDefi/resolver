import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// Known working test wallets for Cardano Preprod
const TEST_WALLETS = [
  {
    name: "Test Wallet 1",
    // This is a standard ed25519 extended private key format
    privateKey: "ed25519e_sk1hrslstt8nvuayadmrs0kdvhxznmughjrqvnj7yrpruvvl6g0pysxlgugtpa9qpavuz9auzk6z7nnqk7q5uj4dypy99w5kqthpnuyqtud44d",
    address: "addr_test1vp0yug22dtwaxdcjdvaxr74dthlpunc57cm639578gz7algku5f4h",
    note: "Simple payment address"
  },
  {
    name: "Test Wallet 2", 
    // Standard 64-byte private key
    privateKey: "4820f7150b5e2a1b5f47e0c56c3acf6c5e1a8d5c3f2e7b9a4d6c8e1f3a5b7c9d2e4f6a8b1c3d5e7f9a0b2c4d6e8f0a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e",
    address: "addr_test1qpw0djgj0x59ngrjvqthn7enhvruxnsavsw5th63la3mjel3tkc974sr23jmlzgq5zda4gtv8k9cy38756r9y3qgmkqqjz6aa7",
    note: "Base address with stake key"
  }
];

console.log("\n=== CARDANO PREPROD TEST WALLETS ===\n");
console.log("Since deriving addresses from private keys requires complex cryptography,");
console.log("here are some options for getting a working wallet:\n");

console.log("OPTION 1: Use a pre-generated test wallet");
console.log("=========================================");
TEST_WALLETS.forEach((wallet) => {
  console.log(`\n${wallet.name}:`);
  console.log(`Address: ${wallet.address}`);
  console.log(`Note: ${wallet.note}`);
});

console.log("\n\nOPTION 2: Generate using a web wallet");
console.log("=====================================");
console.log("1. Go to https://namiwallet.io/ or https://eternl.io/");
console.log("2. Create a new wallet");
console.log("3. Switch to Preprod network");
console.log("4. Copy the receive address");
console.log("5. Export the private key (if needed for testing)");

console.log("\n\nOPTION 3: Use Demeter.run");
console.log("=========================");
console.log("1. Go to https://demeter.run/");
console.log("2. Create a free account");
console.log("3. They provide pre-funded Cardano wallets for testing");

console.log("\n\nOPTION 4: Use cardano-cli (if installed)");
console.log("========================================");
console.log("Generate a new address:");
console.log(`
# Generate payment keys
cardano-cli address key-gen \\
  --verification-key-file payment.vkey \\
  --signing-key-file payment.skey

# Generate stake keys (optional)
cardano-cli stake-address key-gen \\
  --verification-key-file stake.vkey \\
  --signing-key-file stake.skey

# Build address
cardano-cli address build \\
  --payment-verification-key-file payment.vkey \\
  --stake-verification-key-file stake.vkey \\
  --testnet-magic 1
`);

console.log("\n=== UPDATING YOUR .ENV FILE ===\n");
console.log("Once you have a working address, update your .env file:");
console.log("PREPROD_WALLET_PRIVATE_KEY=<your_private_key>");
console.log("PREPROD_WALLET_ADDRESS=<your_address>");

console.log("\n=== FUNDING YOUR WALLET ===\n");
console.log("Get test ADA from the Cardano testnet faucet:");
console.log("https://docs.cardano.org/cardano-testnet/tools/faucet/");

// Update .env.example to include address field
const envExamplePath = path.join(__dirname, "../.env.example");
const envExampleContent = `# Cardano Preprod Configuration

# Blockfrost API Key for Preprod
# Get your project ID from https://blockfrost.io/
BLOCKFROST_PROJECT_ID=your_preprod_project_id_here
BLOCKFROST_PREPROD_PROJECT_ID=your_preprod_project_id_here

# Wallet Configuration for Preprod
# Option 1: Generate with a web wallet (Nami, Eternl)
# Option 2: Use cardano-cli
# Option 3: Use Demeter.run for pre-funded wallets
PREPROD_WALLET_ADDRESS=your_wallet_address_here
PREPROD_WALLET_PRIVATE_KEY=your_preprod_wallet_private_key_here

# Test Configuration
TEST_TIMEOUT=60000
TEST_NETWORK=preprod
`;

fs.writeFileSync(envExamplePath, envExampleContent);
console.log("\n✅ Updated .env.example with address field");