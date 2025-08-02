import { AptosClient, AptosAccount, FaucetClient } from "aptos";
import * as dotenv from "dotenv";
import { createHash } from "crypto";

dotenv.config();

const NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com";
const FAUCET_URL = process.env.APTOS_FAUCET_URL || "https://faucet.testnet.aptoslabs.com";

async function simpleSwapExample() {
  console.log("🔄 Simple Cross-Chain Swap Example\n");

  // Initialize clients
  const client = new AptosClient(NODE_URL);
  const faucetClient = new FaucetClient(NODE_URL, FAUCET_URL);

  // Create accounts
  const alice = new AptosAccount();
  const bob = new AptosAccount();

  console.log("👤 Alice address:", alice.address().hex());
  console.log("👤 Bob address:", bob.address().hex());

  // Fund accounts
  console.log("\n💰 Funding accounts...");
  await faucetClient.fundAccount(alice.address(), 100_000_000);
  await faucetClient.fundAccount(bob.address(), 100_000_000);

  // Module address (replace with your deployed module)
  const moduleAddress = process.env.APTOS_MODULE_ADDRESS || alice.address().hex();

  // Step 1: Create HTLC on Aptos (Alice locks APT for Bob)
  console.log("\n📝 Creating HTLC...");
  
  const secret = Buffer.from("my_secret_phrase_12345");
  const hashlock = createHash("sha256").update(secret).digest();
  const amount = 1_000_000; // 1 APT
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const escrowId = Buffer.from("swap_001");

  const createEscrowPayload = {
    function: `${moduleAddress}::escrow::create_escrow`,
    type_arguments: ["0x1::aptos_coin::AptosCoin"],
    arguments: [
      bob.address().hex(),
      amount.toString(),
      Array.from(hashlock),
      timelock.toString(),
      Array.from(escrowId),
    ],
  };

  const createTxn = await client.generateTransaction(alice.address(), createEscrowPayload);
  const signedCreateTxn = await client.signTransaction(alice, createTxn);
  const createRes = await client.submitTransaction(signedCreateTxn);
  await client.waitForTransaction(createRes.hash);

  console.log("✅ HTLC created:", createRes.hash);

  // Step 2: Check escrow details
  const escrowDetails = await client.view({
    function: `${moduleAddress}::escrow::get_escrow_details`,
    type_arguments: ["0x1::aptos_coin::AptosCoin"],
    arguments: [alice.address().hex()],
  });

  console.log("\n📋 Escrow Details:");
  console.log("  Source:", escrowDetails[0]);
  console.log("  Destination:", escrowDetails[1]);
  console.log("  Amount:", escrowDetails[2]);
  console.log("  State:", escrowDetails[5] === "0" ? "Active" : "Completed");

  // Step 3: Bob withdraws using the secret
  console.log("\n🔓 Bob withdrawing with secret...");

  const withdrawPayload = {
    function: `${moduleAddress}::escrow::withdraw`,
    type_arguments: ["0x1::aptos_coin::AptosCoin"],
    arguments: [
      alice.address().hex(), // escrow holder
      Array.from(secret),
    ],
  };

  const withdrawTxn = await client.generateTransaction(bob.address(), withdrawPayload);
  const signedWithdrawTxn = await client.signTransaction(bob, withdrawTxn);
  const withdrawRes = await client.submitTransaction(signedWithdrawTxn);
  await client.waitForTransaction(withdrawRes.hash);

  console.log("✅ Withdrawal successful:", withdrawRes.hash);

  // Check final balances
  const aliceResources = await client.getAccountResources(alice.address());
  const bobResources = await client.getAccountResources(bob.address());

  const aliceCoinStore = aliceResources.find(
    r => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
  );
  const bobCoinStore = bobResources.find(
    r => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
  );

  console.log("\n💵 Final Balances:");
  console.log("  Alice:", aliceCoinStore?.data.coin.value);
  console.log("  Bob:", bobCoinStore?.data.coin.value);

  console.log("\n✨ Swap completed successfully!");
}

// Run the example
simpleSwapExample()
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });