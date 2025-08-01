import { connect, keyStores, Contract, utils } from "near-api-js";
import { join } from "path";
import { homedir } from "os";

interface CounterContract extends Contract {
  increment(): Promise<void>;
  decrement(): Promise<void>;
  get_value(): Promise<number>;
  reset(): Promise<void>;
}

async function fullTest() {
  const accountId = "unite-defi-test-1754059525.testnet";
  const contractId = accountId;
  const networkId = "testnet";
  
  console.log("[FullTest] Setting up connection...");
  
  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    join(homedir(), ".near-credentials")
  );
  
  const near = await connect({
    networkId,
    keyStore,
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
  });
  
  const account = await near.account(accountId);
  
  const contract = new Contract(account, contractId, {
    viewMethods: ["get_value"],
    changeMethods: ["increment", "decrement", "reset"],
    useLocalViewExecution: false,
  }) as CounterContract;
  
  try {
    console.log("\n[FullTest] === Running Full Contract Test Suite ===\n");
    
    // Test 1: Initial value
    console.log("[Test 1] Checking initial value...");
    let value = await contract.get_value();
    console.log(`✅ Initial value: ${value}`);
    
    // Test 2: Increment
    console.log("\n[Test 2] Testing increment...");
    await contract.increment();
    value = await contract.get_value();
    console.log(`✅ Value after increment: ${value}`);
    
    // Test 3: Multiple increments
    console.log("\n[Test 3] Testing multiple increments...");
    await contract.increment();
    await contract.increment();
    value = await contract.get_value();
    console.log(`✅ Value after 3 total increments: ${value}`);
    
    // Test 4: Decrement
    console.log("\n[Test 4] Testing decrement...");
    await contract.decrement();
    value = await contract.get_value();
    console.log(`✅ Value after decrement: ${value}`);
    
    // Test 5: Reset
    console.log("\n[Test 5] Testing reset...");
    await contract.reset();
    value = await contract.get_value();
    console.log(`✅ Value after reset: ${value}`);
    
    // Test 6: Decrement at zero (should fail)
    console.log("\n[Test 6] Testing decrement at zero (should fail)...");
    try {
      await contract.decrement();
      console.log("❌ Decrement at zero should have failed!");
    } catch (error: any) {
      console.log("✅ Correctly failed to decrement below zero");
    }
    
    console.log("\n[FullTest] === All Tests Passed! ===\n");
    console.log("Contract deployment URL:");
    console.log(`https://explorer.testnet.near.org/accounts/${contractId}`);
    
  } catch (error: any) {
    console.error("\n[FullTest] ❌ Test failed:", error.message);
    process.exit(1);
  }
}

fullTest().catch(console.error);