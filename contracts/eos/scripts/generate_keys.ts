const ecc = require("eosjs-ecc");
import * as fs from "fs";
import * as path from "path";

// Generate EOS key pairs for testnet
function generateKeyPairs() {
  console.log("[KeyGen] Generating EOS key pairs for testnet...\n");

  const accounts = [
    "CONTRACT_ACCOUNT",
    "TEST_ACCOUNT1",
    "TEST_ACCOUNT2",
    "ALICE",
    "BOB",
    "CHARLIE",
    "DAVID"
  ];

  const keyPairs: Record<string, { privateKey: string; publicKey: string }> = {};
  
  accounts.forEach(account => {
    const privateKey = ecc.randomKey();
    const publicKey = ecc.privateToPublic(privateKey);
    
    keyPairs[account] = { privateKey, publicKey };
    
    console.log(`${account}:`);
    console.log(`  Private Key: ${privateKey}`);
    console.log(`  Public Key:  ${publicKey}\n`);
  });

  // Generate .env file content
  let envContent = `# EOS Testnet Configuration
# Generated on ${new Date().toISOString()}

# Testnet RPC Endpoint (Jungle Testnet)
EOS_RPC_ENDPOINT=https://jungle4.greymass.com

# Contract Account
CONTRACT_ACCOUNT=counter${Math.random().toString(36).substring(2, 7)}
CONTRACT_PRIVATE_KEY=${keyPairs.CONTRACT_ACCOUNT.privateKey}
CONTRACT_PUBLIC_KEY=${keyPairs.CONTRACT_ACCOUNT.publicKey}

# Test Accounts
TEST_ACCOUNT1=alice${Math.random().toString(36).substring(2, 7)}
TEST_ACCOUNT1_PRIVATE_KEY=${keyPairs.TEST_ACCOUNT1.privateKey}
TEST_ACCOUNT1_PUBLIC_KEY=${keyPairs.TEST_ACCOUNT1.publicKey}

TEST_ACCOUNT2=bob${Math.random().toString(36).substring(2, 7)}
TEST_ACCOUNT2_PRIVATE_KEY=${keyPairs.TEST_ACCOUNT2.privateKey}
TEST_ACCOUNT2_PUBLIC_KEY=${keyPairs.TEST_ACCOUNT2.publicKey}

# Additional Test Accounts
ALICE_PRIVATE_KEY=${keyPairs.ALICE.privateKey}
ALICE_PUBLIC_KEY=${keyPairs.ALICE.publicKey}

BOB_PRIVATE_KEY=${keyPairs.BOB.privateKey}
BOB_PUBLIC_KEY=${keyPairs.BOB.publicKey}

CHARLIE_PRIVATE_KEY=${keyPairs.CHARLIE.privateKey}
CHARLIE_PUBLIC_KEY=${keyPairs.CHARLIE.publicKey}

DAVID_PRIVATE_KEY=${keyPairs.DAVID.privateKey}
DAVID_PUBLIC_KEY=${keyPairs.DAVID.publicKey}
`;

  // Write to .env file
  const envPath = path.join(__dirname, "..", ".env");
  fs.writeFileSync(envPath, envContent);
  console.log(`[KeyGen] Environment file written to: ${envPath}\n`);

  // Generate account creation instructions
  const instructionsPath = path.join(__dirname, "..", "TESTNET_SETUP.md");
  const instructions = `# EOS Testnet Setup Instructions

Generated on: ${new Date().toISOString()}

## Account Names (for registration)

Please create these accounts on the EOS Jungle Testnet:

1. **Contract Account**: \`counter${keyPairs.CONTRACT_ACCOUNT.publicKey.substring(3, 8).toLowerCase()}\`
   - Public Key: \`${keyPairs.CONTRACT_ACCOUNT.publicKey}\`

2. **Test Account 1**: \`alice${keyPairs.TEST_ACCOUNT1.publicKey.substring(3, 8).toLowerCase()}\`
   - Public Key: \`${keyPairs.TEST_ACCOUNT1.publicKey}\`

3. **Test Account 2**: \`bob${keyPairs.TEST_ACCOUNT2.publicKey.substring(3, 8).toLowerCase()}\`
   - Public Key: \`${keyPairs.TEST_ACCOUNT2.publicKey}\`

## Steps to Create Accounts

1. Go to https://monitor4.jungletestnet.io/#account
2. Click "Create Account"
3. Enter the account name and public key
4. Get some test EOS tokens from the faucet

## Funding

After creating the accounts, you can get test tokens from:
- https://monitor4.jungletestnet.io/#faucet

## Important

- Keep your private keys secure (they are in the .env file)
- These are testnet keys only - never use them on mainnet
- Account names must be 12 characters, lowercase a-z and 1-5 only
`;

  fs.writeFileSync(instructionsPath, instructions);
  console.log(`[KeyGen] Setup instructions written to: ${instructionsPath}\n`);

  // Show the main contract account info for funding
  console.log("=".repeat(60));
  console.log("MAIN CONTRACT ACCOUNT FOR FUNDING:");
  console.log("=".repeat(60));
  console.log(`Account Name: counter${keyPairs.CONTRACT_ACCOUNT.publicKey.substring(3, 8).toLowerCase()}`);
  console.log(`Public Key: ${keyPairs.CONTRACT_ACCOUNT.publicKey}`);
  console.log("=".repeat(60));
}

// Run the generator
generateKeyPairs();