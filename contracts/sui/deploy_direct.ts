import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const WALLET_ADDRESS = "0x409868cb1389522b028a6b8963c382d661c2d58270efa1668088f1cf3e54ad2c";
const PRIVATE_KEY = "0x04dbbb8705d279b43587a59c15d9f4a38067e5404644cff35b6d85a8a3f01fb8";
const RPC_URL = "https://fullnode.testnet.sui.io:443";

interface DeploymentResult {
  packageId: string;
  limitOrderProtocol: string;
  escrowFactory: string;
  mockUSDC: string;
  transactionDigest: string;
}

async function deployContracts(): Promise<DeploymentResult> {
  console.log("[Deploy] Starting deployment to Sui testnet...");
  console.log("[Deploy] Wallet address:", WALLET_ADDRESS);
  
  const client = new SuiClient({ url: RPC_URL });
  
  // Create keypair from private key (remove 0x prefix)
  const cleanPrivateKey = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY.slice(2) : PRIVATE_KEY;
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(cleanPrivateKey, "hex"));
  
  // Verify the address matches
  const derivedAddress = keypair.toSuiAddress();
  console.log("[Deploy] Derived address:", derivedAddress);
  
  if (derivedAddress !== WALLET_ADDRESS) {
    throw new Error(`Address mismatch! Expected ${WALLET_ADDRESS}, got ${derivedAddress}`);
  }
  
  // Check balance
  const balance = await client.getBalance({ owner: WALLET_ADDRESS });
  console.log("[Deploy] Balance:", parseInt(balance.totalBalance) / 1e9, "SUI");
  
  if (parseInt(balance.totalBalance) < 5e8) { // 0.5 SUI minimum
    throw new Error("Insufficient SUI balance for deployment. Need at least 0.5 SUI.");
  }
  
  // Build the contracts
  console.log("[Deploy] Building Move package...");
  try {
    execSync("sui move build --skip-fetch-latest-git-deps", { 
      cwd: __dirname,
      stdio: "inherit" 
    });
  } catch (error) {
    console.error("[Deploy] Build failed:", error);
    throw error;
  }
  
  // Read compiled modules
  const buildPath = path.join(__dirname, "build/unite");
  const compiledModulesPath = path.join(buildPath, "bytecode_modules");
  
  if (!fs.existsSync(compiledModulesPath)) {
    throw new Error("Compiled modules not found. Build may have failed.");
  }
  
  const modules: string[] = [];
  const dependencies: string[] = ["0x1", "0x2"]; // Move stdlib and Sui framework
  
  // Read all compiled modules
  const moduleFiles = fs.readdirSync(compiledModulesPath).filter(file => file.endsWith(".mv"));
  console.log("[Deploy] Found modules:", moduleFiles);
  
  for (const file of moduleFiles) {
    const modulePath = path.join(compiledModulesPath, file);
    const moduleBytes = fs.readFileSync(modulePath);
    modules.push(moduleBytes.toString("base64"));
  }
  
  console.log("[Deploy] Publishing", modules.length, "modules...");
  
  // Create deployment transaction
  const tx = new TransactionBlock();
  
  const [upgradeCap] = tx.publish({
    modules,
    dependencies,
  });
  
  // Transfer upgrade capability to deployer
  tx.transferObjects([upgradeCap], tx.pure(WALLET_ADDRESS));
  
  // Set gas budget
  tx.setGasBudget(500000000); // 0.5 SUI
  
  try {
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });
    
    console.log("[Deploy] Transaction digest:", result.digest);
    
    if (result.effects?.status.status !== "success") {
      throw new Error(`Deployment failed: ${result.effects?.status.error}`);
    }
    
    console.log("[Deploy] ✅ Package published successfully!");
    
    // Extract package ID
    const publishedObject = result.objectChanges?.find(
      (change) => change.type === "published"
    );
    
    if (!publishedObject || !("packageId" in publishedObject)) {
      throw new Error("Could not find published package ID");
    }
    
    const packageId = publishedObject.packageId;
    console.log("[Deploy] Package ID:", packageId);
    
    // Find shared objects
    const sharedObjects = result.objectChanges?.filter(
      (change) => change.type === "created" && 
                  "owner" in change && 
                  typeof change.owner === "object" && 
                  "Shared" in change.owner
    ) || [];
    
    console.log("[Deploy] Found", sharedObjects.length, "shared objects");
    
    let limitOrderProtocol = "";
    let escrowFactory = "";
    let mockUSDC = "";
    
    // Extract object IDs from shared objects
    sharedObjects.forEach((obj, index) => {
      if ("objectId" in obj && "objectType" in obj) {
        console.log(`[Deploy] Shared object ${index}:`, obj.objectId, "Type:", obj.objectType);
        
        if (obj.objectType?.includes("LimitOrderProtocol")) {
          limitOrderProtocol = obj.objectId;
        } else if (obj.objectType?.includes("EscrowFactory")) {
          escrowFactory = obj.objectId;
        } else if (obj.objectType?.includes("Treasury")) {
          mockUSDC = obj.objectId;
        }
      }
    });
    
    // If we couldn't identify by type, assign by order
    if (!limitOrderProtocol && sharedObjects.length >= 1 && "objectId" in sharedObjects[0]) {
      limitOrderProtocol = sharedObjects[0].objectId;
    }
    if (!escrowFactory && sharedObjects.length >= 2 && "objectId" in sharedObjects[1]) {
      escrowFactory = sharedObjects[1].objectId;
    }
    if (!mockUSDC && sharedObjects.length >= 3 && "objectId" in sharedObjects[2]) {
      mockUSDC = sharedObjects[2].objectId;
    }
    
    console.log("\n=== DEPLOYMENT RESULTS ===");
    console.log("Package ID:", packageId);
    console.log("LimitOrderProtocol:", limitOrderProtocol);
    console.log("EscrowFactory:", escrowFactory);
    console.log("MockUSDC Treasury:", mockUSDC);
    console.log("Transaction Digest:", result.digest);
    console.log("===========================");
    
    return {
      packageId,
      limitOrderProtocol,
      escrowFactory,
      mockUSDC,
      transactionDigest: result.digest,
    };
    
  } catch (error: any) {
    console.error("[Deploy] Deployment failed:", error.message);
    if (error.cause) {
      console.error("[Deploy] Cause:", error.cause);
    }
    throw error;
  }
}

async function main() {
  try {
    const deployment = await deployContracts();
    
    // Save deployment info
    const deploymentInfo = {
      ...deployment,
      network: "testnet",
      deployedAt: new Date().toISOString(),
      explorerUrl: `https://suiexplorer.com/txblock/${deployment.transactionDigest}?network=testnet`,
    };
    
    fs.writeFileSync(
      path.join(__dirname, "deployment_result.json"),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log("\n✅ Deployment completed successfully!");
    console.log("Results saved to deployment_result.json");
    console.log(`\nView on explorer: https://suiexplorer.com/txblock/${deployment.transactionDigest}?network=testnet`);
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { deployContracts };