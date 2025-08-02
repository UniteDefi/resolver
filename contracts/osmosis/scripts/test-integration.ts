import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

async function runIntegrationTests() {
  console.log("[Integration] Starting integration test suite...");
  
  const deploymentsPath = join(__dirname, "../deployments.json");
  let deployments: any;
  
  try {
    deployments = JSON.parse(readFileSync(deploymentsPath, "utf-8"));
  } catch (error) {
    console.error("[Integration] No deployments found. Please run deployment first.");
    process.exit(1);
  }
  
  if (!deployments.osmosis) {
    console.error("[Integration] Osmosis contracts not deployed.");
    process.exit(1);
  }
  
  console.log("[Integration] Found Osmosis deployment:", deployments.osmosis.contracts.orderProtocol.contractAddress);
  
  process.env.OSMO_ORDER_PROTOCOL = deployments.osmosis.contracts.orderProtocol.contractAddress;
  process.env.OSMO_ESCROW_FACTORY = deployments.osmosis.contracts.escrowFactory.contractAddress;
  process.env.OSMO_RESOLVER = deployments.osmosis.contracts.resolver.contractAddress;
  
  if (deployments.osmosis.contracts.testToken) {
    process.env.OSMO_TEST_TOKEN = deployments.osmosis.contracts.testToken.contractAddress;
  }
  
  try {
    console.log("\n[Integration] Running contract unit tests...");
    execSync("cargo test", {
      cwd: join(__dirname, "../contracts"),
      stdio: "inherit",
    });
    
    console.log("\n[Integration] Running cross-chain integration tests...");
    execSync("npm test -- cross-chain-swap.test.ts", {
      cwd: __dirname,
      stdio: "inherit",
    });
    
    console.log("\n[Integration] ✅ All tests passed!");
    
  } catch (error: any) {
    console.error("\n[Integration] ❌ Tests failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runIntegrationTests();
}
