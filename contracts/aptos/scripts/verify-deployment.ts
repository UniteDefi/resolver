import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import allDeployments from "../deployments.json";

dotenv.config();

async function verifyDeployment() {
  console.log("[Verify] Starting deployment verification...");

  // Configuration
  const network = (process.env.APTOS_NETWORK as Network) || Network.DEVNET;
  const config = new AptosConfig({ network });
  const aptos = new Aptos(config);

  // Account setup
  const privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("APTOS_PRIVATE_KEY not found in environment variables");
  }

  const account = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });

  console.log("[Verify] Account address:", account.accountAddress.toString());
  console.log("[Verify] Network:", network);

  // Get deployment info
  const deployments = allDeployments.aptos?.[network];
  if (!deployments) {
    console.error(`[Verify] No deployments found for network: ${network}`);
    console.log("[Verify] Available networks:", Object.keys(allDeployments.aptos || {}));
    process.exit(1);
  }

  const packageAddress = deployments.packageAddress;
  console.log("[Verify] Package address:", packageAddress);

  // Check account balance
  try {
    const balance = await aptos.getAccountResource({
      accountAddress: account.accountAddress,
      resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
    });
    console.log("[Verify] Account balance:", (balance as any).coin.value);
  } catch (error) {
    console.log("[Verify] Account not initialized or no balance");
  }

  // Verification tests
  const verificationResults = {
    testCoins: false,
    limitOrderProtocol: false,
    escrowFactory: false,
    modules: false,
  };

  // 1. Verify test coins
  console.log("\n[Verify] Testing coin modules...");
  try {
    // Test USDT balance query (should not fail even if 0)
    await aptos.view({
      payload: {
        function: `${packageAddress}::test_coin::get_usdt_balance`,
        functionArguments: [account.accountAddress],
      },
    });
    
    // Test DAI balance query
    await aptos.view({
      payload: {
        function: `${packageAddress}::test_coin::get_dai_balance`,
        functionArguments: [account.accountAddress],
      },
    });
    
    verificationResults.testCoins = true;
    console.log("✅ Test coin modules working");
  } catch (error: any) {
    console.log("❌ Test coin modules failed:", error.message);
  }

  // 2. Verify limit order protocol
  console.log("\n[Verify] Testing limit order protocol...");
  try {
    await aptos.view({
      payload: {
        function: `${packageAddress}::limit_order_protocol::get_nonce`,
        functionArguments: [account.accountAddress, packageAddress],
      },
    });
    
    verificationResults.limitOrderProtocol = true;
    console.log("✅ Limit order protocol working");
  } catch (error: any) {
    console.log("❌ Limit order protocol failed:", error.message);
  }

  // 3. Verify escrow factory
  console.log("\n[Verify] Testing escrow factory...");
  try {
    // Test getting non-existent escrow (should return 0x0, not fail)
    const dummyHash = new Array(32).fill(0);
    await aptos.view({
      payload: {
        function: `${packageAddress}::escrow_factory::get_src_escrow_address`,
        functionArguments: [dummyHash, packageAddress],
      },
    });
    
    verificationResults.escrowFactory = true;
    console.log("✅ Escrow factory working");
  } catch (error: any) {
    console.log("❌ Escrow factory failed:", error.message);
  }

  // 4. Verify modules exist
  console.log("\n[Verify] Checking deployed modules...");
  try {
    const accountModules = await aptos.getAccountModules({
      accountAddress: packageAddress,
    });
    
    const moduleNames = accountModules.map(module => module.abi?.name || 'unknown');
    console.log("[Verify] Deployed modules:", moduleNames);
    
    const expectedModules = ['test_coin', 'limit_order_protocol', 'escrow_factory', 'escrow', 'resolver'];
    const missingModules = expectedModules.filter(expected => 
      !moduleNames.some(deployed => deployed === expected)
    );
    
    if (missingModules.length === 0) {
      verificationResults.modules = true;
      console.log("✅ All expected modules deployed");
    } else {
      console.log("❌ Missing modules:", missingModules);
    }
  } catch (error: any) {
    console.log("❌ Module verification failed:", error.message);
  }

  // Summary
  console.log("\n=== VERIFICATION SUMMARY ===");
  console.log("Test Coins:", verificationResults.testCoins ? "✅ PASS" : "❌ FAIL");
  console.log("Limit Order Protocol:", verificationResults.limitOrderProtocol ? "✅ PASS" : "❌ FAIL");
  console.log("Escrow Factory:", verificationResults.escrowFactory ? "✅ PASS" : "❌ FAIL");
  console.log("Modules:", verificationResults.modules ? "✅ PASS" : "❌ FAIL");

  const allPassed = Object.values(verificationResults).every(result => result);
  
  if (allPassed) {
    console.log("\n🎉 ALL VERIFICATIONS PASSED!");
    console.log("Your Aptos deployment is ready for cross-chain swaps.");
    console.log(`Explorer: https://explorer.aptoslabs.com/account/${packageAddress}?network=${network}`);
  } else {
    console.log("\n⚠️  SOME VERIFICATIONS FAILED");
    console.log("Please check the errors above and redeploy if necessary.");
    process.exit(1);
  }

  return verificationResults;
}

// Run verification if called directly
if (require.main === module) {
  verifyDeployment().catch(console.error);
}

export { verifyDeployment };