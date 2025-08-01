import * as fs from "fs";
import * as path from "path";

// Use a known valid preprod address for testing
const TEST_WALLET = {
  address: "addr_test1qpw0djgj0x59ngrjvqthn7enhvruxnsavsw5th63la3mjel3tkc974sr23jmlzgq5zda4gtv8k9cy38756r9y3qgmkqqjz6aa7",
  privateKey: "382fd900dedcc3443f14ad760145e358c1d6dae8a6bf7ba8a93de7e68b0ff594"
};

console.log("\n=== CARDANO PREPROD WALLET SETUP ===\n");
console.log("Using test wallet address:", TEST_WALLET.address);
console.log("\nThis is a valid Cardano preprod address that you can fund using the testnet faucet.");

// Update .env file
const envPath = path.join(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf8");

// Update the address in .env if it doesn't exist
if (!envContent.includes("PREPROD_WALLET_ADDRESS=")) {
  const updatedEnv = envContent.replace(
    "PREPROD_WALLET_PRIVATE_KEY=382fd900dedcc3443f14ad760145e358c1d6dae8a6bf7ba8a93de7e68b0ff594",
    `PREPROD_WALLET_ADDRESS=${TEST_WALLET.address}\nPREPROD_WALLET_PRIVATE_KEY=${TEST_WALLET.privateKey}`
  );
  fs.writeFileSync(envPath, updatedEnv);
  console.log("\n✅ Updated .env file with wallet address");
} else {
  console.log("\n✅ .env file already has wallet address");
}

console.log("\n=== NEXT STEPS ===\n");
console.log("1. Fund your wallet:");
console.log("   - Go to: https://docs.cardano.org/cardano-testnet/tools/faucet/");
console.log("   - Select 'Preprod Testnet'");
console.log("   - Enter the address:", TEST_WALLET.address);
console.log("   - Request test ADA\n");

console.log("2. Check your balance:");
console.log("   - Visit: https://preprod.cardanoscan.io/");
console.log("   - Search for:", TEST_WALLET.address);
console.log("   - Or visit directly: https://preprod.cardanoscan.io/address/" + TEST_WALLET.address);

console.log("\n3. Once funded, you can:");
console.log("   - Run tests: npm test");
console.log("   - Deploy contracts: npm run deploy");

console.log("\n=== IMPORTANT NOTES ===");
console.log("- This address is for TESTNET use only");
console.log("- The faucet typically sends 10,000 test ADA");
console.log("- Transactions may take 1-2 minutes to confirm");
console.log("- If the faucet is down, try again later or use Demeter.run\n");