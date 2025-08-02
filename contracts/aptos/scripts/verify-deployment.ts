import { AptosClient, AptosAccount } from "aptos";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface DeploymentInfo {
  network: string;
  deployer: string;
  modules: {
    escrow: string;
    escrowFactory: string;
    limitOrderProtocol: string;
    resolver: string;
    testCoinUSDT: string;
    testCoinDAI: string;
  };
  timestamp: string;
}

async function verifyDeployment() {
  console.log("[Verify] Starting deployment verification...\n");

  // Load deployment info
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("[Verify] No deployment info found. Run 'yarn deploy' first.");
    process.exit(1);
  }

  const deployment: DeploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log("[Verify] Deployment Info:");
  console.log(`  Network: ${deployment.network}`);
  console.log(`  Deployer: ${deployment.deployer}`);
  console.log(`  Timestamp: ${deployment.timestamp}`);

  // Initialize client
  const NODE_URL = process.env.APTOS_NODE_URL || deployment.network;
  const client = new AptosClient(NODE_URL);

  console.log("\n[Verify] Checking modules...");

  // Check each module
  const moduleChecks = [
    { name: "Escrow", address: deployment.modules.escrow },
    { name: "Escrow Factory", address: deployment.modules.escrowFactory },
    { name: "Limit Order Protocol", address: deployment.modules.limitOrderProtocol },
    { name: "Resolver", address: deployment.modules.resolver },
    { name: "Test USDT", address: deployment.modules.testCoinUSDT },
    { name: "Test DAI", address: deployment.modules.testCoinDAI },
  ];

  let allModulesValid = true;

  for (const module of moduleChecks) {
    try {
      const [address, moduleName] = module.address.split("::");
      const moduleData = await client.getAccountModule(address, moduleName);
      
      if (moduleData) {
        console.log(`✅ ${module.name}: Deployed`);
      }
    } catch (error) {
      console.log(`❌ ${module.name}: Not found`);
      allModulesValid = false;
    }
  }

  if (!allModulesValid) {
    console.error("\n[Verify] Some modules are missing. Deployment may have failed.");
    process.exit(1);
  }

  // Check account resources
  console.log("\n[Verify] Checking account resources...");
  
  try {
    const resources = await client.getAccountResources(deployment.deployer);
    console.log(`[Verify] Found ${resources.length} resources`);

    // Check for specific resources
    const expectedResources = [
      "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
      `${deployment.deployer}::escrow::EscrowEvents`,
      `${deployment.deployer}::escrow_factory::EscrowFactory`,
      `${deployment.deployer}::escrow_factory::FactoryEvents`,
      `${deployment.deployer}::limit_order_protocol::OrderBook`,
      `${deployment.deployer}::limit_order_protocol::OrderEvents`,
      `${deployment.deployer}::resolver::ResolverRegistry`,
      `${deployment.deployer}::resolver::ResolverEvents`,
    ];

    for (const resourceType of expectedResources) {
      const resource = resources.find(r => r.type === resourceType);
      if (resource) {
        console.log(`✅ Resource: ${resourceType.split("::").pop()}`);
      } else {
        console.log(`❌ Missing: ${resourceType.split("::").pop()}`);
      }
    }

    // Check coin stores for test tokens
    const usdtStore = resources.find(r => r.type === `0x1::coin::CoinStore<${deployment.deployer}::test_coin::USDT>`);
    const daiStore = resources.find(r => r.type === `0x1::coin::CoinStore<${deployment.deployer}::test_coin::DAI>`);

    if (usdtStore) {
      console.log(`✅ USDT Balance: ${usdtStore.data.coin.value}`);
    }
    if (daiStore) {
      console.log(`✅ DAI Balance: ${daiStore.data.coin.value}`);
    }

  } catch (error) {
    console.error("[Verify] Failed to fetch account resources:", error.message);
  }

  // Test view functions
  console.log("\n[Verify] Testing view functions...");

  try {
    // Test escrow factory
    const escrowCount = await client.view({
      function: `${deployment.deployer}::escrow_factory::get_escrow_count`,
      type_arguments: [],
      arguments: [],
    });
    console.log(`✅ Escrow count: ${escrowCount[0]}`);

    // Test order book
    const orderCount = await client.view({
      function: `${deployment.deployer}::limit_order_protocol::get_order_count`,
      type_arguments: [],
      arguments: [],
    });
    console.log(`✅ Order count: ${orderCount[0]}`);

    // Test resolver registry
    const resolverCount = await client.view({
      function: `${deployment.deployer}::resolver::get_resolver_count`,
      type_arguments: [],
      arguments: [],
    });
    console.log(`✅ Resolver count: ${resolverCount[0]}`);

  } catch (error) {
    console.error("[Verify] Failed to call view functions:", error.message);
  }

  console.log("\n[Verify] Deployment verification complete!");
}

// Run verification
verifyDeployment()
  .catch((error) => {
    console.error("[Verify] Verification failed:", error);
    process.exit(1);
  });