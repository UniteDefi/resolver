import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface DeploymentResult {
  packageId: string;
  escrowFactoryId: string;
  limitOrderProtocolId: string;
  mockUSDTPackageId: string;
  mockDAIPackageId: string;
  mockUSDTTreasuryCapId: string;
  mockDAITreasuryCapId: string;
  mockUSDTMetadataId: string;
  mockDAIMetadataId: string;
  deployerAddress: string;
  network: string;
  timestamp: string;
}

const main = async () => {
  try {
    // Setup client and keypair
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("testnet");
    const client = new SuiClient({ url: rpcUrl });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in .env file");
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
    const deployerAddress = keypair.getPublicKey().toSuiAddress();
    
    console.log("🚀 Deploying Unite Protocol v2 contracts to Sui");
    console.log("📍 Network:", rpcUrl);
    console.log("👤 Deployer:", deployerAddress);
    
    // Check balance
    const balance = await client.getBalance({ owner: deployerAddress });
    console.log("💰 Balance:", Number(balance.totalBalance) / 1e9, "SUI");
    
    if (Number(balance.totalBalance) < 1e8) { // 0.1 SUI minimum
      throw new Error("Insufficient balance. Need at least 0.1 SUI");
    }
    
    // Publish main package
    console.log("\n📦 Publishing Unite Protocol v2 package...");
    const publishTx = new TransactionBlock();
    const [upgradeCap] = publishTx.publish({
      modules: getModuleBytecode(),
      dependencies: [
        "0x1", // Std
        "0x2", // Sui Framework
      ],
    });
    
    // Transfer upgrade capability to deployer
    publishTx.transferObjects([upgradeCap], deployerAddress);
    
    const publishResult = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: publishTx,
      options: {
        showObjectChanges: true,
        showEffects: true,
      },
    });
    
    console.log("✅ Package published:", publishResult.digest);
    
    // Extract package ID
    const publishedObject = publishResult.objectChanges?.find(
      (change: any) => change.type === "published"
    );
    
    if (!publishedObject || !("packageId" in publishedObject)) {
      throw new Error("Could not find published package ID");
    }
    
    const packageId = publishedObject.packageId;
    
    if (!packageId) {
      throw new Error("Failed to extract package ID");
    }
    
    console.log("📦 Package ID:", packageId);
    
    // Deploy factory and protocol
    console.log("\n🏭 Deploying Factory and Protocol...");
    const deployTx = new TransactionBlock();
    
    // Create EscrowFactory
    const [factory, factoryAdminCap] = deployTx.moveCall({
      target: `${packageId}::escrow_factory_v2::create_factory`,
      arguments: [],
    });
    
    // Create LimitOrderProtocol
    const [protocol, protocolAdminCap] = deployTx.moveCall({
      target: `${packageId}::limit_order_protocol::create_protocol`,
      arguments: [],
    });
    
    // Share the factory and protocol
    deployTx.moveCall({
      target: "0x2::transfer::public_share_object",
      arguments: [factory],
      typeArguments: [`${packageId}::escrow_factory_v2::EscrowFactory`],
    });
    
    deployTx.moveCall({
      target: "0x2::transfer::public_share_object", 
      arguments: [protocol],
      typeArguments: [`${packageId}::limit_order_protocol::LimitOrderProtocol`],
    });
    
    // Transfer admin capabilities to deployer
    deployTx.transferObjects([factoryAdminCap, protocolAdminCap], deployerAddress);
    
    const deployResult = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: deployTx,
      options: {
        showObjectChanges: true,
      },
    });
    
    console.log("✅ Factory and Protocol deployed:", deployResult.digest);
    
    // Extract object IDs
    const objectChanges = deployResult.objectChanges || [];
    const factoryObject = objectChanges.find(
      (change: any) => change.type === "created" && 
      change.objectType?.includes("EscrowFactory")
    );
    
    const protocolObject = objectChanges.find(
      (change: any) => change.type === "created" && 
      change.objectType?.includes("LimitOrderProtocol")
    );
    
    const factoryId = factoryObject && "objectId" in factoryObject ? factoryObject.objectId : null;
    const protocolId = protocolObject && "objectId" in protocolObject ? protocolObject.objectId : null;
    
    if (!factoryId || !protocolId) {
      throw new Error("Failed to extract Factory or Protocol ID");
    }
    
    console.log("🏭 Factory ID:", factoryId);
    console.log("📋 Protocol ID:", protocolId);
    
    // Find mock token treasury caps from package deployment
    console.log("\n💰 Finding Mock Token Treasury Caps...");
    // Use the object changes from the publish transaction since mock tokens are created during package init
    const mockTokenResult = findMockTokens(publishResult.objectChanges || [], packageId);
    
    // Save deployment information
    const deployment: DeploymentResult = {
      packageId,
      escrowFactoryId: factoryId,
      limitOrderProtocolId: protocolId,
      mockUSDTPackageId: packageId,
      mockDAIPackageId: packageId,
      mockUSDTTreasuryCapId: mockTokenResult.usdtTreasuryCapId,
      mockDAITreasuryCapId: mockTokenResult.daiTreasuryCapId,
      mockUSDTMetadataId: mockTokenResult.usdtMetadataId,
      mockDAIMetadataId: mockTokenResult.daiMetadataId,
      deployerAddress,
      network: rpcUrl,
      timestamp: new Date().toISOString(),
    };
    
    // Save to file
    const deploymentPath = path.join(__dirname, "..", "deployments_v2.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    
    console.log("\n✅ Deployment completed successfully!");
    console.log("📄 Deployment info saved to:", deploymentPath);
    
    // Display summary
    console.log("\n📊 Deployment Summary:");
    console.log("====================");
    console.log("Main Package ID:", packageId);
    console.log("Factory ID:", factoryId);
    console.log("Protocol ID:", protocolId);
    console.log("Mock USDT Package:", packageId);
    console.log("Mock DAI Package:", packageId);
    console.log("====================");
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
};

function findMockTokens(objectChanges: any[], packageId: string) {
  console.log("🔍 Looking for mock token treasury caps...");
  
  // The treasury caps are created automatically during package deployment
  // Find them in the object changes from the publish transaction
  const usdtTreasuryCapObject = objectChanges.find(
    (change: any) => change.type === "created" && 
    change.objectType?.includes("MOCK_USDT") &&
    change.objectType?.includes("TreasuryCap")
  );
  
  const daiTreasuryCapObject = objectChanges.find(
    (change: any) => change.type === "created" && 
    change.objectType?.includes("MOCK_DAI") &&
    change.objectType?.includes("TreasuryCap")
  );
  
  const usdtMetadataObject = objectChanges.find(
    (change: any) => change.type === "created" && 
    change.objectType?.includes("MOCK_USDT") &&
    change.objectType?.includes("CoinMetadata")
  );
  
  const daiMetadataObject = objectChanges.find(
    (change: any) => change.type === "created" && 
    change.objectType?.includes("MOCK_DAI") &&
    change.objectType?.includes("CoinMetadata")
  );
  
  const usdtTreasuryCapId = usdtTreasuryCapObject && "objectId" in usdtTreasuryCapObject ? usdtTreasuryCapObject.objectId : "";
  const daiTreasuryCapId = daiTreasuryCapObject && "objectId" in daiTreasuryCapObject ? daiTreasuryCapObject.objectId : "";
  const usdtMetadataId = usdtMetadataObject && "objectId" in usdtMetadataObject ? usdtMetadataObject.objectId : "";
  const daiMetadataId = daiMetadataObject && "objectId" in daiMetadataObject ? daiMetadataObject.objectId : "";
  
  console.log("💰 USDT Treasury Cap:", usdtTreasuryCapId || "NOT FOUND");
  console.log("💰 DAI Treasury Cap:", daiTreasuryCapId || "NOT FOUND");
  console.log("📊 USDT Metadata:", usdtMetadataId || "NOT FOUND");
  console.log("📊 DAI Metadata:", daiMetadataId || "NOT FOUND");
  
  return {
    usdtTreasuryCapId,
    daiTreasuryCapId,
    usdtMetadataId,
    daiMetadataId,
  };
}

function getModuleBytecode(): string[] {
  const buildPath = path.join(__dirname, "..", "build", "unite", "bytecode_modules");
  
  if (!fs.existsSync(buildPath)) {
    throw new Error("Build directory not found. Run 'sui move build' first.");
  }
  
  const modules = fs.readdirSync(buildPath)
    .filter((file) => file.endsWith(".mv"))
    .map((file) => {
      const modulePath = path.join(buildPath, file);
      return fs.readFileSync(modulePath).toString("base64");
    });
  
  if (modules.length === 0) {
    throw new Error("No compiled modules found");
  }
  
  console.log(`📚 Found ${modules.length} modules to deploy`);
  return modules;
}

main().catch(console.error);