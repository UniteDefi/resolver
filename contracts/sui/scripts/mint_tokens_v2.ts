import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface DeploymentInfo {
  packageId: string;
  escrowFactoryId: string;
  limitOrderProtocolId: string;
  mockUSDTTreasuryCapId: string;
  mockDAITreasuryCapId: string;
  deployerAddress: string;
}

interface Recipient {
  name: string;
  address: string;
  usdtAmount: number;
  daiAmount: number;
}

const main = async () => {
  try {
    // Load deployment info
    const deploymentPath = path.join(__dirname, "..", "deployments_v2.json");
    if (!fs.existsSync(deploymentPath)) {
      throw new Error("Deployment file not found. Run deploy_v2.ts first.");
    }
    
    const deployment: DeploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    
    // Setup client and keypair
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("testnet");
    const client = new SuiClient({ url: rpcUrl });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in .env file");
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
    const deployerAddress = keypair.getPublicKey().toSuiAddress();
    
    console.log("🪙 Minting Mock Tokens");
    console.log("📦 Package ID:", deployment.packageId);
    console.log("👤 Deployer:", deployerAddress);
    
    // Define recipients with test amounts (using very small DAI amounts due to u64 limits)
    const recipients: Recipient[] = [
      {
        name: "Test User",
        address: process.env.SUI_TEST_USER_ADDRESS || "",
        usdtAmount: 1000, // 1,000 USDT (6 decimals = 1000 * 1e6)
        daiAmount: 10,    // 10 DAI (18 decimals = 10 * 1e18)
      },
      {
        name: "Resolver 0",
        address: process.env.SUI_RESOLVER_ADDRESS_0 || "",
        usdtAmount: 5000, // 5,000 USDT
        daiAmount: 10,    // 10 DAI (max for u64)
      },
      {
        name: "Resolver 1",
        address: process.env.SUI_RESOLVER_ADDRESS_1 || "",
        usdtAmount: 5000,
        daiAmount: 10,
      },
      {
        name: "Resolver 2", 
        address: process.env.SUI_RESOLVER_ADDRESS_2 || "",
        usdtAmount: 3000,
        daiAmount: 10,
      },
      {
        name: "Resolver 3",
        address: process.env.SUI_RESOLVER_ADDRESS_3 || "",
        usdtAmount: 3000,
        daiAmount: 10,
      },
    ];
    
    // Filter out recipients without addresses
    const validRecipients = recipients.filter(r => r.address && r.address !== "");
    
    if (validRecipients.length === 0) {
      throw new Error("No valid recipient addresses found in .env file");
    }
    
    console.log(`💰 Minting tokens for ${validRecipients.length} recipients...\n`);
    
    // Mint tokens in batches
    for (const recipient of validRecipients) {
      console.log(`🎯 Minting for ${recipient.name} (${recipient.address})`);
      
      const tx = new TransactionBlock();
      
      // Mint USDT (6 decimals)
      const usdtAmountRaw = BigInt(recipient.usdtAmount * 1e6);
      const [usdtCoin] = tx.moveCall({
        target: `${deployment.packageId}::mock_usdt::mint`,
        arguments: [
          tx.object(deployment.mockUSDTTreasuryCapId),
          tx.pure.u64(usdtAmountRaw.toString()),
        ],
      });
      
      // Mint DAI (18 decimals)
      const daiAmountRaw = BigInt(recipient.daiAmount) * BigInt(1e18);
      const [daiCoin] = tx.moveCall({
        target: `${deployment.packageId}::mock_dai::mint`,
        arguments: [
          tx.object(deployment.mockDAITreasuryCapId),
          tx.pure.u64(daiAmountRaw.toString()),
        ],
      });
      
      // Transfer coins to recipient
      tx.transferObjects([usdtCoin, daiCoin], recipient.address);
      
      const result = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: tx,
        options: {
          showEffects: true,
        },
      });
      
      if (result.effects?.status?.status === "success") {
        console.log(`  ✅ ${recipient.usdtAmount.toLocaleString()} USDT + ${recipient.daiAmount.toLocaleString()} DAI minted`);
        console.log(`  📄 Tx: ${result.digest}`);
      } else {
        console.log(`  ❌ Failed to mint for ${recipient.name}`);
        console.log(`  📄 Tx: ${result.digest}`);
      }
      
      // Small delay between transactions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log("\n✅ Token minting completed!");
    
    // Display summary
    console.log("\n📊 Minting Summary:");
    console.log("==================");
    validRecipients.forEach(recipient => {
      console.log(`${recipient.name}: ${recipient.usdtAmount.toLocaleString()} USDT + ${recipient.daiAmount.toLocaleString()} DAI`);
    });
    
  } catch (error) {
    console.error("❌ Token minting failed:", error);
    process.exit(1);
  }
};

main().catch(console.error);