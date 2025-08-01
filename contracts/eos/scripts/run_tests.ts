import { JsonRpc, Api } from "eosjs";
import { JsSignatureProvider } from "eosjs/dist/eosjs-jssig";
import * as dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

async function runTests() {
  console.log("🧪 Running EOS Infrastructure Tests...\n");

  const rpcEndpoint = process.env.EOS_RPC_ENDPOINT || "https://jungle4.greymass.com";
  const contractAccount = process.env.CONTRACT_ACCOUNT || "unitedefidep";
  const testAccounts = [
    process.env.TEST_ACCOUNT1 || "unitedefiusr1",
    process.env.TEST_ACCOUNT2 || "unitedefiusr2"
  ];

  const rpc = new JsonRpc(rpcEndpoint, { fetch: fetch as any });
  
  let passed = 0;
  let failed = 0;

  // Test 1: Connection
  try {
    console.log("🔗 Test 1: Testing connection to Jungle testnet...");
    const info = await rpc.get_info();
    if (info.chain_id === "73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d") {
      console.log("   ✅ Connected to Jungle Testnet successfully");
      console.log("   📊 Current block:", info.head_block_num);
      passed++;
    } else {
      console.log("   ❌ Wrong chain ID");
      failed++;
    }
  } catch (error) {
    console.log("   ❌ Connection failed:", (error as any).message);
    failed++;
  }

  // Test 2: Contract account exists and funded
  try {
    console.log("\n💰 Test 2: Verifying contract account...");
    const accountInfo = await rpc.get_account(contractAccount);
    const balance = await rpc.get_currency_balance("eosio.token", contractAccount, "EOS");
    
    console.log("   ✅ Contract account exists:", accountInfo.account_name);
    console.log("   💵 Balance:", balance.length > 0 ? balance[0] : "0.0000 EOS");
    
    if (balance.length > 0 && parseFloat(balance[0]) > 0) {
      console.log("   ✅ Account is funded");
      passed++;
    } else {
      console.log("   ❌ Account needs funding");
      failed++;
    }
  } catch (error) {
    console.log("   ❌ Contract account check failed:", (error as any).message);
    failed++;
  }

  // Test 3: Test accounts
  for (let i = 0; i < testAccounts.length; i++) {
    try {
      console.log(`\n👤 Test ${3 + i}: Verifying test account ${testAccounts[i]}...`);
      const accountInfo = await rpc.get_account(testAccounts[i]);
      const balance = await rpc.get_currency_balance("eosio.token", testAccounts[i], "EOS");
      
      console.log(`   ✅ Test account ${i + 1} exists:`, accountInfo.account_name);
      console.log(`   💵 Balance:`, balance.length > 0 ? balance[0] : "0.0000 EOS");
      passed++;
    } catch (error: any) {
      if (error.message.includes("unknown key")) {
        console.log(`   ⚠️  Test account ${i + 1} needs to be created:`, testAccounts[i]);
        console.log(`   📝 Create at: https://monitor4.jungletestnet.io/#account`);
        failed++;
      } else {
        console.log(`   ❌ Error checking test account ${i + 1}:`, error.message);
        failed++;
      }
    }
  }

  // Test 4: Key validation
  try {
    console.log("\n🔑 Test 5: Validating private keys...");
    const privateKey = process.env.CONTRACT_ACTIVE_PRIVATE_KEY || process.env.CONTRACT_PRIVATE_KEY;
    if (privateKey && privateKey.length > 10) {
      const signatureProvider = new JsSignatureProvider([privateKey]);
      const api = new Api({
        rpc,
        signatureProvider,
        textDecoder: new TextDecoder(),
        textEncoder: new TextEncoder()
      });
      
      // Test serialization (doesn't send transaction)
      const actions = [{
        account: "eosio.token",
        name: "transfer",
        authorization: [{ actor: contractAccount, permission: "active" }],
        data: { from: contractAccount, to: contractAccount, quantity: "0.0001 EOS", memo: "test" }
      }];
      
      api.serializeActions(actions);
      console.log("   ✅ Private keys are valid");
      passed++;
    } else {
      console.log("   ❌ Private key not found in environment");
      failed++;
    }
  } catch (error) {
    console.log("   ❌ Key validation failed:", (error as any).message);
    failed++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log("\n🎉 All infrastructure tests passed!");
    console.log("✨ Ready to deploy contract once WASM is compiled!");
  } else {
    console.log("\n⚠️  Some tests failed. Please fix issues before deploying.");
  }

  console.log("\n📋 Next Steps:");
  console.log("1. Compile contract with EOSIO CDT to get counter.wasm");
  console.log("2. Create missing test accounts");
  console.log("3. Run: yarn deploy:testnet");
  console.log("4. Test contract interactions");
}

runTests().catch(console.error);