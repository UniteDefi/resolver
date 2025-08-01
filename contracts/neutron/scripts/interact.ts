import { CounterContract } from "../tests/src/client";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const mnemonic = process.env.MNEMONIC;
  const rpcEndpoint = process.env.RPC_ENDPOINT || "https://rpc-falcron.pion-1.ntrn.tech";
  
  if (!mnemonic) {
    console.error("MNEMONIC environment variable is required");
    process.exit(1);
  }

  const deploymentPath = path.join(__dirname, "../deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error(`[Interact] Deployment file not found at: ${deploymentPath}`);
    console.error("[Interact] Please deploy the contract first");
    process.exit(1);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log(`[Interact] Using contract at: ${deploymentInfo.contractAddress}`);

  try {
    const contract = await CounterContract.create(mnemonic, rpcEndpoint);
    
    contract["contractAddress"] = deploymentInfo.contractAddress;

    console.log("[Interact] Querying current count...");
    let count = await contract.getCount();
    console.log(`[Interact] Current count: ${count}`);

    console.log("[Interact] Incrementing counter...");
    await contract.increment();
    count = await contract.getCount();
    console.log(`[Interact] Count after increment: ${count}`);

    console.log("[Interact] Incrementing counter again...");
    await contract.increment();
    count = await contract.getCount();
    console.log(`[Interact] Count after second increment: ${count}`);

    console.log("[Interact] Decrementing counter...");
    await contract.decrement();
    count = await contract.getCount();
    console.log(`[Interact] Count after decrement: ${count}`);

    console.log("[Interact] Resetting counter to 100...");
    await contract.reset(100);
    count = await contract.getCount();
    console.log(`[Interact] Count after reset: ${count}`);

    console.log("[Interact] Interaction completed successfully!");
    
  } catch (error) {
    console.error("[Interact] Interaction failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}