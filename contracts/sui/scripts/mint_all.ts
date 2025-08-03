import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface Recipient {
  name: string;
  address: string;
  usdtAmount: string; // Raw amount with decimals
  daiAmount: string;  // Raw amount with decimals
}

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
    
    console.log("🪙 Minting Test Tokens to All Recipients");
    console.log("📦 Package ID:", deployment.packageId);
    console.log("👤 Deployer:", deployerAddress);
    
    // Define recipients with raw amounts (already calculated with decimals)
    const recipients: Recipient[] = [
      {
        name: "Test User",
        address: process.env.SUI_TEST_USER_ADDRESS || "",
        usdtAmount: "1000000000", // 1000 USDT (6 decimals)
        daiAmount: "1000000000000000000000", // 1000 DAI (18 decimals)
      },
      {
        name: "Resolver 0",
        address: process.env.SUI_RESOLVER_ADDRESS_0 || "",
        usdtAmount: "5000000000", // 5000 USDT
        daiAmount: "1000000000000000000", // 1 DAI (to fit u64)
      },
      {
        name: "Resolver 1",
        address: process.env.SUI_RESOLVER_ADDRESS_1 || "",
        usdtAmount: "5000000000", // 5000 USDT
        daiAmount: "1000000000000000000", // 1 DAI
      },
      {
        name: "Resolver 2",
        address: process.env.SUI_RESOLVER_ADDRESS_2 || "",
        usdtAmount: "3000000000", // 3000 USDT
        daiAmount: "1000000000000000000", // 1 DAI
      },
      {
        name: "Resolver 3",
        address: process.env.SUI_RESOLVER_ADDRESS_3 || "",
        usdtAmount: "3000000000", // 3000 USDT
        daiAmount: "1000000000000000000", // 1 DAI
      },
    ];
    
    // Filter out recipients without addresses
    const validRecipients = recipients.filter(r => r.address && r.address !== "");
    console.log(`💰 Minting for ${validRecipients.length} recipients...\n`);
    
    // Mint to each recipient
    for (const recipient of validRecipients) {
      console.log(`🎯 Minting for ${recipient.name} (${recipient.address})`);
      
      try {
        // Mint USDT
        const usdtTx = new TransactionBlock();
        usdtTx.moveCall({
          target: `${deployment.packageId}::mock_usdt::mint_and_transfer`,
          arguments: [
            usdtTx.object(deployment.mockUSDTTreasuryCapId),
            usdtTx.pure.u64(recipient.usdtAmount),
            usdtTx.pure.address(recipient.address),
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
          console.log("  ✅ USDT minted");
        } else {
          console.log("  ❌ USDT failed");
        }
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mint DAI
        const daiTx = new TransactionBlock();
        daiTx.moveCall({
          target: `${deployment.packageId}::mock_dai::mint_and_transfer`,
          arguments: [
            daiTx.object(deployment.mockDAITreasuryCapId),
            daiTx.pure.u64(recipient.daiAmount),
            daiTx.pure.address(recipient.address),
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
          console.log("  ✅ DAI minted");
        } else {
          console.log("  ❌ DAI failed");
        }
        
        console.log(`  📄 USDT Tx: ${usdtResult.digest}`);
        console.log(`  📄 DAI Tx: ${daiResult.digest}`);
        
      } catch (error) {
        console.log(`  ❌ Failed to mint for ${recipient.name}:`, error);
      }
      
      // Delay between recipients
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log("\n✅ Token minting completed!");
    
  } catch (error) {
    console.error("❌ Token minting failed:", error);
    process.exit(1);
  }
};

main().catch(console.error);