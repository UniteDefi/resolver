import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import dotenv from "dotenv";

dotenv.config();

async function testFinal() {
  const contractAddress = "KT1JhnmeBRv6doaHka9amABehERv3CwxYzrT";
  
  // Initialize Tezos toolkit
  const tezos = new TezosToolkit("https://ghostnet.smartpy.io");
  tezos.setProvider({
    signer: new InMemorySigner(process.env.TEZOS_TESTNET_SECRET_KEY!),
  });

  console.log("[Test Final] Testing final counter contract:", contractAddress);
  console.log("[Test Final] View on explorer: https://ghostnet.tzkt.io/" + contractAddress);

  try {
    // Get contract instance
    const contract = await tezos.contract.at(contractAddress);
    
    // Check initial storage
    console.log("\n===== Initial State =====");
    let storage = await contract.storage() as any;
    console.log("Initial value:", storage.toString());

    // Test 1: Simple increment
    console.log("\n===== Test 1: Increment by 5 =====");
    console.log("Expected: 10 + 5 = 15");
    const op1 = await contract.methods.increment(5).send();
    console.log("Operation:", op1.hash);
    await op1.confirmation();
    
    storage = await contract.storage() as any;
    console.log("Actual result:", storage.toString());
    console.log("Success:", storage.toString() === "15" ? "✅" : "❌");

    // Test 2: Simple decrement
    console.log("\n===== Test 2: Decrement by 3 =====");
    console.log("Expected: 15 - 3 = 12");
    const op2 = await contract.methods.decrement(3).send();
    console.log("Operation:", op2.hash);
    await op2.confirmation();
    
    storage = await contract.storage() as any;
    console.log("Actual result:", storage.toString());
    console.log("Success:", storage.toString() === "12" ? "✅" : "❌");

    // Test 3: Decrement to exactly zero
    console.log("\n===== Test 3: Decrement by 12 (exact to zero) =====");
    console.log("Expected: 12 - 12 = 0");
    const op3 = await contract.methods.decrement(12).send();
    console.log("Operation:", op3.hash);
    await op3.confirmation();
    
    storage = await contract.storage() as any;
    console.log("Actual result:", storage.toString());
    console.log("Success:", storage.toString() === "0" ? "✅" : "❌");

    // Test 4: Increment from zero
    console.log("\n===== Test 4: Increment by 8 from zero =====");
    console.log("Expected: 0 + 8 = 8");
    const op4 = await contract.methods.increment(8).send();
    console.log("Operation:", op4.hash);
    await op4.confirmation();
    
    storage = await contract.storage() as any;
    console.log("Actual result:", storage.toString());
    console.log("Success:", storage.toString() === "8" ? "✅" : "❌");

    // Test 5: Decrement below zero (should clamp to 0)
    console.log("\n===== Test 5: Decrement by 20 (below zero) =====");
    console.log("Expected: max(8 - 20, 0) = 0");
    const op5 = await contract.methods.decrement(20).send();
    console.log("Operation:", op5.hash);
    await op5.confirmation();
    
    storage = await contract.storage() as any;
    console.log("Actual result:", storage.toString());
    console.log("Success:", storage.toString() === "0" ? "✅" : "❌");

    console.log("\n===== All tests completed! =====");
    console.log("Final storage value:", storage.toString());

  } catch (error) {
    console.error("[Test Final] Error:", error);
    process.exit(1);
  }
}

// Run tests
testFinal().catch((error) => {
  console.error("[Test Final] Unexpected error:", error);
  process.exit(1);
});