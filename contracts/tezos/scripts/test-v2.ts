import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import dotenv from "dotenv";

dotenv.config();

async function testV2() {
  const contractAddress = "KT1EniUczx9NdFtjdVESTz2jssgnvLpReLbR";
  
  // Initialize Tezos toolkit
  const tezos = new TezosToolkit("https://ghostnet.smartpy.io");
  tezos.setProvider({
    signer: new InMemorySigner(process.env.TEZOS_TESTNET_SECRET_KEY!),
  });

  console.log("[Test V2] Testing improved counter contract:", contractAddress);

  try {
    // Get contract instance
    const contract = await tezos.contract.at(contractAddress);
    
    // Check initial storage
    console.log("\n[Test V2] Checking initial storage...");
    let storage = await contract.storage() as any;
    console.log("[Test V2] Initial value:", storage.toString());

    // Test increment
    console.log("\n[Test V2] Testing increment by 5...");
    const incrementOp = await contract.methods.increment(5).send();
    console.log("[Test V2] Operation hash:", incrementOp.hash);
    await incrementOp.confirmation();
    
    storage = await contract.storage() as any;
    console.log("[Test V2] Value after increment (10 + 5):", storage.toString());

    // Test normal decrement
    console.log("\n[Test V2] Testing decrement by 3...");
    const decrementOp = await contract.methods.decrement(3).send();
    console.log("[Test V2] Operation hash:", decrementOp.hash);
    await decrementOp.confirmation();
    
    storage = await contract.storage() as any;
    console.log("[Test V2] Value after decrement (15 - 3):", storage.toString());

    // Test decrement that would go below zero
    console.log("\n[Test V2] Testing decrement by 20 (should clamp to 0)...");
    const bigDecrementOp = await contract.methods.decrement(20).send();
    console.log("[Test V2] Operation hash:", bigDecrementOp.hash);
    await bigDecrementOp.confirmation();
    
    storage = await contract.storage() as any;
    console.log("[Test V2] Value after big decrement (should be 0):", storage.toString());

    // Test increment from zero
    console.log("\n[Test V2] Testing increment by 7 from zero...");
    const incrementFromZeroOp = await contract.methods.increment(7).send();
    console.log("[Test V2] Operation hash:", incrementFromZeroOp.hash);
    await incrementFromZeroOp.confirmation();
    
    storage = await contract.storage() as any;
    console.log("[Test V2] Final value:", storage.toString());

    console.log("\n[Test V2] All tests completed successfully!");
    console.log("[Test V2] View on explorer: https://ghostnet.tzkt.io/" + contractAddress);

  } catch (error) {
    console.error("[Test V2] Error:", error);
    process.exit(1);
  }
}

// Run tests
testV2().catch((error) => {
  console.error("[Test V2] Unexpected error:", error);
  process.exit(1);
});