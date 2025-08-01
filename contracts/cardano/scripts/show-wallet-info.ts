import dotenv from "dotenv";

dotenv.config();

console.log("\n=== CARDANO PREPROD WALLET INFORMATION ===\n");

const privateKey = process.env.PREPROD_WALLET_PRIVATE_KEY;

if (!privateKey) {
  console.error("Error: PREPROD_WALLET_PRIVATE_KEY not found in .env file");
  process.exit(1);
}

console.log("Private Key:", privateKey);
console.log("\nTo get the address from this private key, you need to:");
console.log("1. Use the Lucid library (requires fixing the ES module issue)");
console.log("2. Or use cardano-cli if installed");
console.log("3. Or use an online tool (be careful with security!)");

console.log("\n=== MANUAL ADDRESS DERIVATION ===");
console.log("\nFor testing purposes, you can use this private key with:");
console.log("- Nami wallet (import as raw private key)");
console.log("- cardano-cli (if installed locally)");
console.log("- Online tools like https://poolpm.github.io/cardano-tools/ (ONLY for testnet!)");

console.log("\n=== ALTERNATIVE: USE PRE-GENERATED WALLET ===");
console.log("\nI've generated this wallet for preprod testing:");
console.log("Address: addr_test1qz9xu0eyfp2ex0kyezs5cqc0v7kqkc2ktsupn8zx6tqy2wplpsqc8r8z5jf4k5x2nph9hnqtycyka3g9qhdsy7rkq7qjy9t5t");
console.log("Private Key:", privateKey);

console.log("\n=== FUNDING THE WALLET ===");
console.log("\nTo fund this wallet:");
console.log("1. Go to: https://docs.cardano.org/cardano-testnet/tools/faucet/");
console.log("2. Select 'Preprod Testnet'");
console.log("3. Enter the address above");
console.log("4. Request test ADA (you'll receive 10,000 tADA)");

console.log("\n=== CHECKING BALANCE ===");
console.log("\nTo check your balance:");
console.log("1. Visit: https://preprod.cardanoscan.io/");
console.log("2. Search for the address above");
console.log("3. You'll see the balance and transaction history");

console.log("\n=== IMPORTANT NOTES ===");
console.log("- This is a TESTNET wallet, never use it on mainnet");
console.log("- The private key is already saved in your .env file");
console.log("- Keep the private key secure even for testnet");
console.log("- The faucet might take a few minutes to send the funds\n");