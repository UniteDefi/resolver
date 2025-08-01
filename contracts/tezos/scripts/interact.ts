import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import dotenv from "dotenv";

dotenv.config();

async function interact() {
  const contractAddress = "KT1XhxgCJxKw9wyXrP2LXN71ZnFMr6pYituo";
  
  // Initialize Tezos toolkit
  const tezos = new TezosToolkit("https://ghostnet.smartpy.io");
  tezos.setProvider({
    signer: new InMemorySigner(process.env.TEZOS_TESTNET_SECRET_KEY!),
  });

  console.log("[Interact] Connecting to contract:", contractAddress);

  try {
    // Get contract instance
    const contract = await tezos.contract.at(contractAddress);
    
    // Check initial storage
    console.log("\n[Interact] Checking initial storage...");
    let storage = await contract.storage() as any;
    console.log("[Interact] Current value:", storage.toString());

    // Test increment
    console.log("\n[Interact] Testing increment by 5...");
    const incrementOp = await contract.methods.increment(5).send();
    console.log("[Interact] Increment operation hash:", incrementOp.hash);
    console.log("[Interact] Waiting for confirmation...");
    await incrementOp.confirmation();
    console.log("[Interact] Increment confirmed!");

    // Check storage after increment
    storage = await contract.storage() as any;
    console.log("[Interact] Value after increment:", storage.toString());

    // Test decrement
    console.log("\n[Interact] Testing decrement by 3...");
    const decrementOp = await contract.methods.decrement(3).send();
    console.log("[Interact] Decrement operation hash:", decrementOp.hash);
    console.log("[Interact] Waiting for confirmation...");
    await decrementOp.confirmation();
    console.log("[Interact] Decrement confirmed!");

    // Check storage after decrement
    storage = await contract.storage() as any;
    console.log("[Interact] Value after decrement:", storage.toString());

    // Test decrement below zero
    console.log("\n[Interact] Testing decrement by 10 (should result in 0)...");
    const bigDecrementOp = await contract.methods.decrement(10).send();
    console.log("[Interact] Big decrement operation hash:", bigDecrementOp.hash);
    console.log("[Interact] Waiting for confirmation...");
    await bigDecrementOp.confirmation();
    console.log("[Interact] Big decrement confirmed!");

    // Check final storage
    storage = await contract.storage() as any;
    console.log("[Interact] Final value:", storage.toString());

    console.log("\n[Interact] All tests completed successfully!");
    console.log("[Interact] View on explorer: https://ghostnet.tzkt.io/" + contractAddress);

  } catch (error) {
    console.error("[Interact] Error:", error);
    process.exit(1);
  }
}

// Run interaction
interact().catch((error) => {
  console.error("[Interact] Unexpected error:", error);
  process.exit(1);
});