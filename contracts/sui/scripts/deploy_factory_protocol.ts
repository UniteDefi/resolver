import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

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
    
    // Use the package ID from the successful publish
    const packageId = "0x6250d81f60c6ae30e8c82412973f20857db0a220d2cab6a54e8cb1c41ec67a5d";
    
    console.log("🏭 Deploying Factory and Protocol...");
    console.log("📦 Package ID:", packageId);
    console.log("👤 Deployer:", deployerAddress);
    
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
    
    // Find mock token treasury caps from the already published package
    console.log("\n💰 Finding Mock Token Treasury Caps...");
    
    // Get all owned objects by deployer and look for treasury caps
    const ownedObjects = await client.getOwnedObjects({
      owner: deployerAddress,
      options: {
        showType: true,
        showContent: true,
      },
    });
    
    const usdtTreasuryCapId = ownedObjects.data.find(
      (obj) => obj.data?.type?.includes("MOCK_USDT") && obj.data?.type?.includes("TreasuryCap")
    )?.data?.objectId || "";
    
    const daiTreasuryCapId = ownedObjects.data.find(
      (obj) => obj.data?.type?.includes("MOCK_DAI") && obj.data?.type?.includes("TreasuryCap")
    )?.data?.objectId || "";
    
    console.log("💰 USDT Treasury Cap:", usdtTreasuryCapId || "NOT FOUND");
    console.log("💰 DAI Treasury Cap:", daiTreasuryCapId || "NOT FOUND");
    
    // Save deployment information
    const deployment = {
      packageId,
      escrowFactoryId: factoryId,
      limitOrderProtocolId: protocolId,
      mockUSDTPackageId: packageId,
      mockDAIPackageId: packageId,
      mockUSDTTreasuryCapId: usdtTreasuryCapId,
      mockDAITreasuryCapId: daiTreasuryCapId,
      mockUSDTMetadataId: "", // Will be found later if needed
      mockDAIMetadataId: "", // Will be found later if needed
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
    console.log("Mock USDT Treasury Cap:", usdtTreasuryCapId || "NOT FOUND");
    console.log("Mock DAI Treasury Cap:", daiTreasuryCapId || "NOT FOUND");
    console.log("====================");
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
};

main().catch(console.error);