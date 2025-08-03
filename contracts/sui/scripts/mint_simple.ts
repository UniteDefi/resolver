import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const main = async () => {
  try {
    // Load deployment info
    const deploymentPath = path.join(__dirname, "..", "deployments_v2.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    
    // Setup client and keypair
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("testnet");
    const client = new SuiClient({ url: rpcUrl });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in .env file");
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
    const deployerAddress = keypair.getPublicKey().toSuiAddress();
    
    console.log("🪙 Simple Token Minting Test");
    console.log("📦 Package ID:", deployment.packageId);
    console.log("👤 Deployer:", deployerAddress);
    
    // Test with one recipient first
    const testRecipient = process.env.SUI_RESOLVER_ADDRESS_0 || "";
    console.log("🎯 Test recipient:", testRecipient);
    
    // Mint USDT first
    console.log("Minting USDT...");
    const usdtTx = new TransactionBlock();
    usdtTx.moveCall({
      target: `${deployment.packageId}::mock_usdt::mint_and_transfer`,
      arguments: [
        usdtTx.object(deployment.mockUSDTTreasuryCapId),
        usdtTx.pure.u64("1000000"), // 1 USDT (6 decimals)
        usdtTx.pure.address(testRecipient),
      ],
    });
    
    const usdtResult = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: usdtTx,
      options: {
        showEffects: true,
      },
    });
    
    if (usdtResult.effects?.status?.status === "success") {
      console.log("✅ USDT minted successfully");
      console.log("📄 Tx:", usdtResult.digest);
    } else {
      console.log("❌ USDT minting failed");
      console.log("📄 Tx:", usdtResult.digest);
    }
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mint DAI
    console.log("Minting DAI...");
    const daiTx = new TransactionBlock();
    daiTx.moveCall({
      target: `${deployment.packageId}::mock_dai::mint_and_transfer`,
      arguments: [
        daiTx.object(deployment.mockDAITreasuryCapId),
        daiTx.pure.u64("1000000000000000000"), // 1 DAI (18 decimals)
        daiTx.pure.address(testRecipient),
      ],
    });
    
    const daiResult = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: daiTx,
      options: {
        showEffects: true,
      },
    });
    
    if (daiResult.effects?.status?.status === "success") {
      console.log("✅ DAI minted successfully");
      console.log("📄 Tx:", daiResult.digest);
    } else {
      console.log("❌ DAI minting failed");
      console.log("📄 Tx:", daiResult.digest);
    }
    
  } catch (error) {
    console.error("❌ Simple minting failed:", error);
    process.exit(1);
  }
};

main().catch(console.error);