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

  console.log("[Deploy] Starting deployment process...");
  
  try {
    const contract = await CounterContract.create(mnemonic, rpcEndpoint);
    console.log(`[Deploy] Using deployer address: ${contract.getAddress()}`);

    const wasmPath = path.join(__dirname, "../target/wasm32-unknown-unknown/release/counter.wasm");
    
    if (!fs.existsSync(wasmPath)) {
      console.error(`[Deploy] WASM file not found at: ${wasmPath}`);
      console.error("[Deploy] Please build the contract first with: cargo build --release --target wasm32-unknown-unknown");
      process.exit(1);
    }

    console.log("[Deploy] Uploading contract...");
    const codeId = await contract.uploadContract(wasmPath);
    console.log(`[Deploy] Contract uploaded with code ID: ${codeId}`);

    console.log("[Deploy] Instantiating contract...");
    const initialCount = parseInt(process.env.INITIAL_COUNT || "0");
    const contractAddress = await contract.instantiate(
      codeId,
      { count: initialCount },
      `counter-${Date.now()}`
    );
    
    console.log(`[Deploy] Contract instantiated at: ${contractAddress}`);
    
    const deploymentInfo = {
      codeId,
      contractAddress,
      deployer: contract.getAddress(),
      network: rpcEndpoint,
      timestamp: new Date().toISOString(),
      initialCount,
    };

    const deploymentPath = path.join(__dirname, "../deployments.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`[Deploy] Deployment info saved to: ${deploymentPath}`);

    console.log("[Deploy] Testing contract...");
    const count = await contract.getCount();
    console.log(`[Deploy] Current count: ${count}`);
    
    console.log("[Deploy] Deployment completed successfully!");
    
  } catch (error) {
    console.error("[Deploy] Deployment failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}