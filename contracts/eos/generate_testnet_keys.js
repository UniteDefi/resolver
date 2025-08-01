const crypto = require('crypto');

// Simple EOS key generation (for demonstration)
// Note: In production, use proper EOS libraries
function generateEOSKeys() {
  // Generate random bytes for private key
  const privateKeyBytes = crypto.randomBytes(32);
  const privateKey = '5K' + privateKeyBytes.toString('base64').replace(/[+/=]/g, '').substring(0, 49);
  
  // For testnet, we'll use placeholder public keys
  // In real implementation, you'd derive the public key from private key
  const publicKeyBase = crypto.randomBytes(33).toString('hex');
  const publicKey = 'EOS' + publicKeyBase.substring(0, 50).toUpperCase();
  
  return { privateKey, publicKey };
}

console.log("[KeyGen] Generating EOS key pairs for testnet...\n");

// Generate keys for each account
const accounts = {
  CONTRACT: generateEOSKeys(),
  TEST1: generateEOSKeys(),
  TEST2: generateEOSKeys(),
  ALICE: generateEOSKeys(),
  BOB: generateEOSKeys()
};

// Generate account names
const contractName = 'cntr' + crypto.randomBytes(4).toString('hex').substring(0, 8);
const test1Name = 'alce' + crypto.randomBytes(4).toString('hex').substring(0, 8);
const test2Name = 'bob' + crypto.randomBytes(4).toString('hex').substring(0, 9);

// Create .env content
const envContent = `# EOS Testnet Configuration
# Generated on ${new Date().toISOString()}

# Testnet RPC Endpoint (Jungle Testnet)
EOS_RPC_ENDPOINT=https://jungle4.greymass.com

# Contract Account
CONTRACT_ACCOUNT=${contractName}
CONTRACT_PRIVATE_KEY=${accounts.CONTRACT.privateKey}
CONTRACT_PUBLIC_KEY=${accounts.CONTRACT.publicKey}

# Test Accounts
TEST_ACCOUNT1=${test1Name}
TEST_ACCOUNT1_PRIVATE_KEY=${accounts.TEST1.privateKey}
TEST_ACCOUNT1_PUBLIC_KEY=${accounts.TEST1.publicKey}

TEST_ACCOUNT2=${test2Name}
TEST_ACCOUNT2_PRIVATE_KEY=${accounts.TEST2.privateKey}
TEST_ACCOUNT2_PUBLIC_KEY=${accounts.TEST2.publicKey}

# Additional Test Accounts
ALICE_PRIVATE_KEY=${accounts.ALICE.privateKey}
ALICE_PUBLIC_KEY=${accounts.ALICE.publicKey}

BOB_PRIVATE_KEY=${accounts.BOB.privateKey}
BOB_PUBLIC_KEY=${accounts.BOB.publicKey}
`;

// Write .env file
const fs = require('fs');
const path = require('path');

fs.writeFileSync(path.join(__dirname, '.env'), envContent);

console.log("=".repeat(60));
console.log("EOS TESTNET WALLET INFORMATION");
console.log("=".repeat(60));
console.log("\nMAIN CONTRACT ACCOUNT FOR FUNDING:");
console.log(`Account Name: ${contractName}`);
console.log(`Public Key: ${accounts.CONTRACT.publicKey}`);
console.log(`Private Key: ${accounts.CONTRACT.privateKey}`);
console.log("\nTEST ACCOUNT 1:");
console.log(`Account Name: ${test1Name}`);
console.log(`Public Key: ${accounts.TEST1.publicKey}`);
console.log("\nTEST ACCOUNT 2:");
console.log(`Account Name: ${test2Name}`);
console.log(`Public Key: ${accounts.TEST2.publicKey}`);
console.log("=".repeat(60));
console.log("\nIMPORTANT: These are placeholder keys for testing.");
console.log("For real EOS testnet, you'll need to:");
console.log("1. Use proper EOS key generation tools");
console.log("2. Register accounts on Jungle Testnet");
console.log("3. Get test tokens from the faucet");
console.log("\nEnvironment file saved to: contracts/eos/.env");