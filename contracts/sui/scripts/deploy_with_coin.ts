import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

dotenv.config({ path: path.join(__dirname, "../.env") });

async function deploy() {
  const rpcUrl = process.env.SUI_RPC_URL || "https://fullnode.devnet.sui.io";
  const network = process.env.SUI_NETWORK || "devnet";
  
  const client = new SuiClient({ url: rpcUrl });
  
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SUI_PRIVATE_KEY not set in environment");
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  const address = keypair.toSuiAddress();
  
  console.log("[Deploy] Deploying from address:", address);
  console.log("[Deploy] Network:", network);
  console.log("[Deploy] RPC URL:", rpcUrl);

  // Get coins
  const coins = await client.getCoins({
    owner: address,
  });
  
  console.log("[Deploy] Found", coins.data.length, "coins");
  if (coins.data.length > 0) {
    console.log("[Deploy] First coin:", coins.data[0].coinObjectId);
    console.log("[Deploy] Balance:", coins.data[0].balance, "MIST");
  }

  // Build the package first
  console.log("[Deploy] Building Move package...");
  try {
    execSync("sui move build", { 
      cwd: path.join(__dirname, ".."),
      stdio: "inherit" 
    });
  } catch (error) {
    console.error("[Deploy] Build failed:", error);
    process.exit(1);
  }

  // Read the compiled modules
  const buildPath = path.join(__dirname, "../build/counter");
  const compiledModulesPath = path.join(buildPath, "bytecode_modules");
  
  if (!fs.existsSync(compiledModulesPath)) {
    throw new Error("Compiled modules not found. Make sure to build the package first.");
  }

  const modules: string[] = [];
  // Add framework dependencies
  const dependencies: string[] = [
    "0x1",  // Move stdlib
    "0x2",  // Sui framework
  ];
  
  // Read all compiled modules
  const moduleFiles = fs.readdirSync(compiledModulesPath);
  for (const file of moduleFiles) {
    if (file.endsWith(".mv")) {
      const modulePath = path.join(compiledModulesPath, file);
      const moduleBytes = fs.readFileSync(modulePath);
      modules.push(moduleBytes.toString("base64"));
    }
  }

  console.log("[Deploy] Found", modules.length, "modules to deploy");

  // Create a transaction block for publishing
  const tx = new TransactionBlock();
  
  const [upgradeCap] = tx.publish({
    modules,
    dependencies,
  });
  
  // Transfer the upgrade capability to the sender
  tx.transferObjects([upgradeCap], tx.pure(address));

  // Set gas budget and gas payment
  tx.setGasBudget(100000000);
  if (coins.data.length > 0) {
    tx.setGasPayment([{
      objectId: coins.data[0].coinObjectId,
      version: coins.data[0].version,
      digest: coins.data[0].digest,
    }]);
  }

  console.log("[Deploy] Publishing package...");
  
  try {
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log("[Deploy] Transaction digest:", result.digest);
    
    if (result.effects?.status.status === "success") {
      console.log("[Deploy] ✅ Package published successfully!");
      
      // Find the published package ID
      const publishedObject = result.objectChanges?.find(
        (change) => change.type === "published"
      );
      
      if (publishedObject && "packageId" in publishedObject) {
        const packageId = publishedObject.packageId;
        console.log("[Deploy] Package ID:", packageId);
        
        // Find the Counter object (shared object)
        const sharedObject = result.objectChanges?.find(
          (change) => change.type === "created" && 
                      "owner" in change && 
                      typeof change.owner === "object" && 
                      "Shared" in change.owner
        );
        
        if (sharedObject && "objectId" in sharedObject) {
          console.log("[Deploy] Counter Object ID:", sharedObject.objectId);
          
          // Update .env file
          const envContent = `# Sui Configuration
SUI_RPC_URL=${rpcUrl}
SUI_NETWORK=${network}
SUI_PRIVATE_KEY=${privateKey}
COUNTER_PACKAGE_ID=${packageId}
COUNTER_OBJECT_ID=${sharedObject.objectId}
`;
          
          fs.writeFileSync(path.join(__dirname, "../.env"), envContent);
          console.log("[Deploy] Updated .env file with deployment info");
        }
      }
    } else {
      console.error("[Deploy] ❌ Transaction failed:", result.effects?.status);
    }
  } catch (error: any) {
    console.error("[Deploy] Publish failed:", error.message);
    if (error.cause) {
      console.error("[Deploy] Cause:", error.cause);
    }
    process.exit(1);
  }
}

deploy().catch(console.error);