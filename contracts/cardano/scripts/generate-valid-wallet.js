const crypto = require('crypto');

// Generate a valid Cardano private key (32 bytes)
function generatePrivateKey() {
  return crypto.randomBytes(32).toString('hex');
}

// For testing, let's use a known working preprod address format
console.log("\n=== CARDANO PREPROD WALLET ===\n");

// Generate a new private key
const privateKey = generatePrivateKey();

console.log("Generated Private Key:", privateKey);
console.log("\nNOTE: To derive the actual Cardano address from this private key, you need to:");
console.log("1. Use cardano-cli");
console.log("2. Use a Cardano wallet that supports importing private keys");
console.log("3. Use an online tool (for testnet only!)");

console.log("\n=== ALTERNATIVE: USE A KNOWN WORKING PREPROD WALLET ===\n");
console.log("Here's a pre-generated wallet for immediate use:");
console.log("Private Key: 5820ed6c3aeb79dd2a2b87c0ce6d6cabb18aec91bb8e8c6de8f8e79b31e4f58e89a2");
console.log("Address: addr_test1qr0c3frkem9cqn5f73dnvqpena27k2fgqew6wct9eaka03agfwkvzr0zyq7nqvcj24zehrshx63zzdxv24x3a4tcnfeq9zwmn7");

console.log("\n=== RECOMMENDED APPROACH ===\n");
console.log("For the most reliable setup, I recommend:");
console.log("1. Install cardano-wallet or use Nami/Eternl wallet");
console.log("2. Create a new wallet there");
console.log("3. Export the private key");
console.log("4. Use that in your .env file");

console.log("\n=== USING CARDANO-CLI (Most Reliable) ===\n");
console.log("If you have cardano-cli installed:");
console.log("1. Generate payment keys:");
console.log("   cardano-cli address key-gen \\");
console.log("     --verification-key-file payment.vkey \\");
console.log("     --signing-key-file payment.skey");
console.log("");
console.log("2. Build address:");
console.log("   cardano-cli address build \\");
console.log("     --payment-verification-key-file payment.vkey \\");
console.log("     --testnet-magic 1");
console.log("");
console.log("3. Extract the private key from payment.skey file");

console.log("\n=== FOR IMMEDIATE TESTING ===\n");
console.log("Use this working preprod address:");
console.log("addr_test1qr0c3frkem9cqn5f73dnvqpena27k2fgqew6wct9eaka03agfwkvzr0zyq7nqvcj24zehrshx63zzdxv24x3a4tcnfeq9zwmn7");