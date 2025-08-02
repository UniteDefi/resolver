import { AptosClient, AptosAccount, FaucetClient } from "aptos";
import * as dotenv from "dotenv";

dotenv.config();

const NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com";
const FAUCET_URL = process.env.APTOS_FAUCET_URL || "https://faucet.testnet.aptoslabs.com";

async function multiResolverExample() {
  console.log("🌐 Multi-Resolver Example\n");

  // Initialize clients
  const client = new AptosClient(NODE_URL);
  const faucetClient = new FaucetClient(NODE_URL, FAUCET_URL);

  // Create accounts for different resolvers
  const resolver1 = new AptosAccount();
  const resolver2 = new AptosAccount();
  const resolver3 = new AptosAccount();
  const admin = new AptosAccount();

  console.log("🔑 Admin:", admin.address().hex());
  console.log("🤖 Resolver 1:", resolver1.address().hex());
  console.log("🤖 Resolver 2:", resolver2.address().hex());
  console.log("🤖 Resolver 3:", resolver3.address().hex());

  // Fund accounts
  console.log("\n💰 Funding accounts...");
  await faucetClient.fundAccount(admin.address(), 100_000_000);
  await faucetClient.fundAccount(resolver1.address(), 10_000_000);
  await faucetClient.fundAccount(resolver2.address(), 10_000_000);
  await faucetClient.fundAccount(resolver3.address(), 10_000_000);

  const moduleAddress = process.env.APTOS_MODULE_ADDRESS || admin.address().hex();

  // Initialize resolver registry
  console.log("\n📊 Initializing resolver registry...");
  const initPayload = {
    function: `${moduleAddress}::resolver::initialize`,
    type_arguments: [],
    arguments: [],
  };

  const initTxn = await client.generateTransaction(admin.address(), initPayload);
  const signedInitTxn = await client.signTransaction(admin, initTxn);
  const initRes = await client.submitTransaction(signedInitTxn);
  await client.waitForTransaction(initRes.hash);

  // Register multiple resolvers with different fee structures
  console.log("\n📝 Registering resolvers...");

  const resolvers = [
    { account: resolver1, name: "FastResolver", feeBps: 25 }, // 0.25%
    { account: resolver2, name: "StandardResolver", feeBps: 50 }, // 0.5%
    { account: resolver3, name: "PremiumResolver", feeBps: 100 }, // 1%
  ];

  for (const resolver of resolvers) {
    const registerPayload = {
      function: `${moduleAddress}::resolver::register_resolver`,
      type_arguments: [],
      arguments: [
        Array.from(Buffer.from(resolver.name, "utf8")),
        resolver.feeBps.toString(),
      ],
    };

    const registerTxn = await client.generateTransaction(
      resolver.account.address(),
      registerPayload
    );
    const signedRegisterTxn = await client.signTransaction(resolver.account, registerTxn);
    const registerRes = await client.submitTransaction(signedRegisterTxn);
    await client.waitForTransaction(registerRes.hash);

    console.log(`✅ ${resolver.name} registered`);
  }

  // Check resolver count
  const resolverCount = await client.view({
    function: `${moduleAddress}::resolver::get_resolver_count`,
    type_arguments: [],
    arguments: [],
  });

  console.log(`\n📈 Total resolvers: ${resolverCount[0]}`);

  // Display resolver information
  console.log("\n📋 Resolver Details:");
  
  for (const resolver of resolvers) {
    const info = await client.view({
      function: `${moduleAddress}::resolver::get_resolver_info`,
      type_arguments: [],
      arguments: [resolver.account.address().hex()],
    });

    const name = Buffer.from(info[0] as number[]).toString("utf8");
    const feeBps = info[1];
    const isActive = info[2];
    const totalResolved = info[3];

    console.log(`\n${name}:`);
    console.log(`  Address: ${resolver.account.address().hex()}`);
    console.log(`  Fee: ${feeBps} bps (${Number(feeBps) / 100}%)`);
    console.log(`  Active: ${isActive}`);
    console.log(`  Total Resolved: ${totalResolved}`);
  }

  // Simulate resolver activity
  console.log("\n🔄 Simulating resolver activity...");

  for (let i = 0; i < 3; i++) {
    const resolver = resolvers[i % resolvers.length];
    const escrowId = Buffer.alloc(32);
    escrowId.writeUInt32BE(i, 0);
    const secret = Buffer.alloc(32);
    secret.writeUInt32BE(i * 100, 0);

    const resolvePayload = {
      function: `${moduleAddress}::resolver::resolve_swap`,
      type_arguments: [],
      arguments: [
        Array.from(escrowId),
        Array.from(secret),
      ],
    };

    const resolveTxn = await client.generateTransaction(
      resolver.account.address(),
      resolvePayload
    );
    const signedResolveTxn = await client.signTransaction(resolver.account, resolveTxn);
    const resolveRes = await client.submitTransaction(signedResolveTxn);
    await client.waitForTransaction(resolveRes.hash);

    console.log(`✅ ${resolver.name} resolved swap ${i + 1}`);
  }

  // Update resolver status
  console.log("\n🔧 Updating resolver status...");

  const updatePayload = {
    function: `${moduleAddress}::resolver::update_resolver`,
    type_arguments: [],
    arguments: [
      "75", // New fee: 0.75%
      "false", // Deactivate
    ],
  };

  const updateTxn = await client.generateTransaction(resolver3.address(), updatePayload);
  const signedUpdateTxn = await client.signTransaction(resolver3, updateTxn);
  const updateRes = await client.submitTransaction(signedUpdateTxn);
  await client.waitForTransaction(updateRes.hash);

  console.log("✅ PremiumResolver deactivated");

  // Show final stats
  console.log("\n📊 Final Resolver Statistics:");

  for (const resolver of resolvers) {
    const info = await client.view({
      function: `${moduleAddress}::resolver::get_resolver_info`,
      type_arguments: [],
      arguments: [resolver.account.address().hex()],
    });

    const name = Buffer.from(info[0] as number[]).toString("utf8");
    const totalResolved = info[3];
    const isActive = info[2];

    console.log(`${name}: ${totalResolved} swaps resolved (${isActive ? "Active" : "Inactive"})`);
  }

  console.log("\n✨ Multi-resolver example completed!");
}

// Run the example
multiResolverExample()
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });