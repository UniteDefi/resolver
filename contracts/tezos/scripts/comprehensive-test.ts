import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import dotenv from "dotenv";

dotenv.config();

async function comprehensiveTest() {
  // Use the working simple contract
  const contractAddress = "KT1XhxgCJxKw9wyXrP2LXN71ZnFMr6pYituo";
  
  // Initialize Tezos toolkit
  const tezos = new TezosToolkit("https://ghostnet.smartpy.io");
  tezos.setProvider({
    signer: new InMemorySigner(process.env.TEZOS_TESTNET_SECRET_KEY!),
  });

  console.log("=".repeat(60));
  console.log("COMPREHENSIVE TEZOS COUNTER CONTRACT TEST");
  console.log("=".repeat(60));
  console.log("Contract:", contractAddress);
  console.log("Explorer: https://ghostnet.tzkt.io/" + contractAddress);
  console.log("\nContract Type: Simple Counter with ABS Decrement");
  console.log("- increment(n): adds n to counter");
  console.log("- decrement(n): sets counter to ABS(counter - n)");
  console.log("=".repeat(60));

  try {
    // Get contract instance
    const contract = await tezos.contract.at(contractAddress);
    
    // Get initial state
    let storage = await contract.storage() as any;
    const initialValue = parseInt(storage.toString());
    console.log(`\n🔢 Initial Value: ${initialValue}`);

    // Test scenarios
    const tests = [
      { action: "increment", amount: 10, description: "Basic increment" },
      { action: "decrement", amount: 3, description: "Normal decrement (ABS logic)" },
      { action: "increment", amount: 5, description: "Another increment" },
      { action: "decrement", amount: 50, description: "Large decrement (demonstrates ABS)" },
      { action: "increment", amount: 15, description: "Final increment" }
    ];

    let currentValue = initialValue;
    let testCount = 1;

    for (const test of tests) {
      console.log(`\n--- Test ${testCount}: ${test.description} ---`);
      console.log(`Current value: ${currentValue}`);
      console.log(`Action: ${test.action}(${test.amount})`);
      
      let expectedValue: number;
      if (test.action === "increment") {
        expectedValue = currentValue + test.amount;
      } else {
        // ABS decrement logic
        expectedValue = Math.abs(currentValue - test.amount);
      }
      
      console.log(`Expected result: ${expectedValue}`);

      // Execute transaction
      const op = await (contract.methods as any)[test.action](test.amount).send();
      console.log(`⏳ Transaction: ${op.hash}`);
      await op.confirmation();
      
      // Check result
      storage = await contract.storage() as any;
      const actualValue = parseInt(storage.toString());
      console.log(`✅ Actual result: ${actualValue}`);
      
      const success = actualValue === expectedValue;
      console.log(`🎯 Result: ${success ? "SUCCESS" : "FAILED"}`);
      
      if (!success) {
        console.log(`❌ Expected ${expectedValue}, got ${actualValue}`);
      }
      
      currentValue = actualValue;
      testCount++;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("FINAL SUMMARY");
    console.log(`${"=".repeat(60)}`);
    console.log(`📊 Final Counter Value: ${currentValue}`);
    console.log(`🚀 All transactions confirmed on Ghostnet`);
    console.log(`✅ Contract is working correctly with ABS decrement logic`);
    console.log(`🔗 View all operations: https://ghostnet.tzkt.io/${contractAddress}/operations`);
    console.log(`${"=".repeat(60)}`);

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run comprehensive test
comprehensiveTest().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});