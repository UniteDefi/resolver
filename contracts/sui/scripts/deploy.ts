import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
// Get directory path
const currentDir = path.resolve(__dirname);

dotenv.config({ path: path.join(__dirname, "../.env") });

interface DeploymentResult {
  packageId: string;
  limitOrderProtocol: string;
  escrowFactory: string;
  mockUSDC: string;
  resolver0: string;
  resolver1: string;
  resolver2: string;
}

async function deploySuiContracts(): Promise<DeploymentResult> {
  const rpcUrl = process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io";
  const network = process.env.SUI_NETWORK || "testnet";
  
  const client = new SuiClient({ url: rpcUrl });
  
  const privateKey = process.env.SUI_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY or SUI_PRIVATE_KEY not set in environment");
  }
  
  const cleanPrivateKey = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(cleanPrivateKey, "hex"));
  const address = keypair.toSuiAddress();
  
  console.log("[Deploy] Deploying from address:", address);
  console.log("[Deploy] Network:", network);
  console.log("[Deploy] RPC URL:", rpcUrl);

  const balance = await client.getBalance({ owner: address });
  console.log("[Deploy] Balance:", parseInt(balance.totalBalance) / 1e9, "SUI");

  if (parseInt(balance.totalBalance) < 1e9) { // Less than 1 SUI
    throw new Error("Insufficient SUI balance for deployment. Need at least 1 SUI.");
  }

  // Build the package
  console.log("[Deploy] Building Move package...");
  try {
    execSync("sui move build", { 
      cwd: path.join(__dirname, ".."),
      stdio: "inherit" 
    });
  } catch (error) {
    console.error("[Deploy] Build failed:", error);
    throw error;
  }

  // Read compiled modules
  const buildPath = path.join(__dirname, "../build/unite");
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

  console.log("[Deploy] Deploying", modules.length, "modules...");

  // Create deployment transaction
  const tx = new TransactionBlock();
  
  const [upgradeCap] = tx.publish({
    modules,
    dependencies,
  });
  
  // Transfer upgrade capability to deployer
  tx.transferObjects([upgradeCap], tx.pure(address));
  
  // Set gas budget
  tx.setGasBudget(100000000);
  
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
    
    // Find created shared objects (factories and protocols)
    const sharedObjects = result.objectChanges?.filter(
      (change) => change.type === "created" && 
                  "owner" in change && 
                  typeof change.owner === "object" && 
                  "Shared" in change.owner
    ) || [];
    
    console.log("[Deploy] Found", sharedObjects.length, "shared objects");
    
    // Parse events to identify which object is which
    const events = result.events || [];
    let limitOrderProtocol = "";
    let escrowFactory = "";
    let mockUSDC = "";
    
    // Look for specific creation events
    for (const event of events) {
      if (event.type.includes("ProtocolCreated")) {
        // Find the corresponding object
        const protocolObj = sharedObjects.find(obj => 
          "objectId" in obj && events.some(e => 
            e.type.includes("ProtocolCreated") && 
            JSON.stringify(e.parsedJson).includes(obj.objectId)
          )
        );
        if (protocolObj && "objectId" in protocolObj) {
          limitOrderProtocol = protocolObj.objectId;
        }
      } else if (event.type.includes("EscrowFactoryCreated")) {
        const factoryObj = sharedObjects.find(obj => 
          "objectId" in obj && events.some(e => 
            e.type.includes("EscrowFactoryCreated") && 
            JSON.stringify(e.parsedJson).includes(obj.objectId)
          )
        );
        if (factoryObj && "objectId" in factoryObj) {
          escrowFactory = factoryObj.objectId;
        }
      }
    }
    
    // If we couldn't match by events, assign by order created
    if (!limitOrderProtocol || !escrowFactory) {
      console.log("[Deploy] Could not match objects by events, assigning by order...");
      if (sharedObjects.length >= 2) {
        if (!limitOrderProtocol && "objectId" in sharedObjects[0]) {
          limitOrderProtocol = sharedObjects[0].objectId;
        }
        if (!escrowFactory && "objectId" in sharedObjects[1]) {
          escrowFactory = sharedObjects[1].objectId;
        }
      }
    }
    
    // Find MockUSDC treasury (also shared)
    const treasuryObject = sharedObjects.find(obj => 
      "objectType" in obj && obj.objectType?.includes("Treasury")
    );
    if (treasuryObject && "objectId" in treasuryObject) {
      mockUSDC = treasuryObject.objectId;
    }
    
    console.log("[Deploy] Contract addresses:");
    console.log("  LimitOrderProtocol:", limitOrderProtocol);
    console.log("  EscrowFactory:", escrowFactory);
    console.log("  MockUSDC Treasury:", mockUSDC);
    
    // For resolvers, we'll create them in separate transactions
    console.log("[Deploy] Creating resolver objects...");
    
    const resolvers: string[] = [];
    
    // Create 3 resolver instances
    for (let i = 0; i < 3; i++) {
      try {
        const resolverTx = new TransactionBlock();
        
        resolverTx.moveCall({
          target: `${packageId}::resolver::create_resolver`,
          arguments: [
            resolverTx.pure(escrowFactory),
            resolverTx.pure(limitOrderProtocol),
          ],
        });
        
        const resolverResult = await client.signAndExecuteTransactionBlock({
          transactionBlock: resolverTx,
          signer: keypair,
          options: {
            showEffects: true,
            showObjectChanges: true,
          },
        });
        
        if (resolverResult.effects?.status.status === "success") {
          const createdObjs = resolverResult.objectChanges?.filter(
            change => change.type === "created" && "owner" in change && 
                     typeof change.owner === "object" && "AddressOwner" in change.owner
          );
          
          if (createdObjs && createdObjs.length > 0 && "objectId" in createdObjs[0]) {
            resolvers.push(createdObjs[0].objectId);
            console.log(`[Deploy] Resolver ${i} created:`, createdObjs[0].objectId);
          }
        }
      } catch (error) {
        console.log(`[Deploy] Failed to create resolver ${i}:`, error);
        resolvers.push(""); // Placeholder
      }
    }
    
    return {
      packageId,
      limitOrderProtocol,
      escrowFactory,
      mockUSDC,
      resolver0: resolvers[0] || "",
      resolver1: resolvers[1] || "",
      resolver2: resolvers[2] || "",
    };
    
  } catch (error: any) {
    console.error("[Deploy] Deployment failed:", error.message);
    if (error.cause) {
      console.error("[Deploy] Cause:", error.cause);
    }
    throw error;
  }
}

async function updateDeploymentsJson(deployment: DeploymentResult, network: string) {
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  let deployments: any = {};
  
  // Read existing deployments
  if (fs.existsSync(deploymentsPath)) {
    const deploymentsContent = fs.readFileSync(deploymentsPath, "utf-8");
    deployments = JSON.parse(deploymentsContent);
  }
  
  // Initialize sui section if it doesn't exist
  if (!deployments.sui) {
    deployments.sui = {};
  }
  
  // Update the network configuration
  deployments.sui[network] = {
    chainId: 2,
    name: network === "testnet" ? "Sui Testnet" : network === "devnet" ? "Sui Devnet" : "Sui Mainnet",
    rpcUrl: process.env.SUI_RPC_URL || `https://fullnode.${network}.sui.io`,
    packageId: deployment.packageId,
    LimitOrderProtocol: deployment.limitOrderProtocol,
    EscrowFactory: deployment.escrowFactory,
    MockUSDC: deployment.mockUSDC,
    Resolver0: deployment.resolver0,
    Resolver1: deployment.resolver1,
    Resolver2: deployment.resolver2,
    Clock: "0x0000000000000000000000000000000000000000000000000000000000000006"
  };
  
  // Write back to file
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`[Deploy] Updated deployments.json for ${network}`);
}

async function main() {
  try {
    const network = process.env.SUI_NETWORK || "testnet";
    console.log(`[Deploy] Starting deployment to Sui ${network}...`);
    
    const deployment = await deploySuiContracts();
    await updateDeploymentsJson(deployment, network);
    
    console.log("\n[Deploy] ✅ Deployment completed successfully!");
    console.log("\n=== Deployment Summary ===");
    console.log("Package ID:", deployment.packageId);
    console.log("LimitOrderProtocol:", deployment.limitOrderProtocol);
    console.log("EscrowFactory:", deployment.escrowFactory);
    console.log("MockUSDC Treasury:", deployment.mockUSDC);
    console.log("Resolver0:", deployment.resolver0);
    console.log("Resolver1:", deployment.resolver1);
    console.log("Resolver2:", deployment.resolver2);
    
    console.log("\n--- Next Steps ---");
    console.log("1. Fund resolver addresses with SUI for gas");
    console.log("2. Mint test USDC tokens for testing");
    console.log("3. Run cross-chain tests");
    console.log(`4. Check deployment on: https://suiexplorer.com/?network=${network}`);
    
  } catch (error) {
    console.error("[Deploy] Deployment failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { deploySuiContracts, updateDeploymentsJson };