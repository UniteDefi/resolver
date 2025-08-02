const { SuiClient } = require("@mysten/sui.js/client");
const { Ed25519Keypair } = require("@mysten/sui.js/keypairs/ed25519");
const { TransactionBlock } = require("@mysten/sui.js/transactions");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config({ path: path.join(__dirname, ".env") });

async function deployDirect() {
  console.log("🚀 DIRECT DEPLOYMENT TO SUI TESTNET");
  console.log("=" .repeat(50));
  
  const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL });
  
  const deployer = Ed25519Keypair.fromSecretKey(
    Buffer.from(process.env.PRIVATE_KEY.slice(2), "hex")
  );
  
  console.log("👛 Deployer Address:", deployer.toSuiAddress());
  
  // Check balance first
  console.log("\n💰 Checking SUI balance...");
  try {
    const balance = await suiClient.getBalance({
      owner: deployer.toSuiAddress(),
      coinType: "0x2::sui::SUI"
    });
    const suiAmount = (parseInt(balance.totalBalance) / 1_000_000_000).toFixed(3);
    console.log(`   Balance: ${suiAmount} SUI`);
    
    if (parseInt(balance.totalBalance) < 1_000_000_000) {
      console.log("❌ Insufficient SUI for deployment (need at least 1 SUI)");
      return;
    }
  } catch (error) {
    console.log("❌ Error checking balance:", error.message);
    return;
  }
  
  // Read the compiled modules
  console.log("\n📦 Reading compiled modules...");
  
  let modules, dependencies, digest;
  
  try {
    // Build first
    const { execSync } = require("child_process");
    console.log("🔧 Building...");
    execSync("sui move build", { stdio: "inherit", cwd: __dirname });
    
    // Read the build output
    const buildPath = path.join(__dirname, "build/unite/bytecode_modules");
    const files = fs.readdirSync(buildPath);
    
    modules = [];
    for (const file of files) {
      if (file.endsWith('.mv')) {
        const moduleBytes = fs.readFileSync(path.join(buildPath, file));
        modules.push(Array.from(moduleBytes));
      }
    }
    
    console.log(`✅ Found ${modules.length} modules to deploy`);
    
    // Read dependencies
    const dependenciesPath = path.join(__dirname, "build/unite/package-digest");
    if (fs.existsSync(dependenciesPath)) {
      digest = fs.readFileSync(dependenciesPath, 'utf8').trim();
    }
    
    dependencies = ["0x1", "0x2"]; // Standard library dependencies
    
  } catch (error) {
    console.log("❌ Error reading compiled modules:", error.message);
    return;
  }
  
  // Deploy using TransactionBlock
  console.log("\n🚀 Deploying contracts...");
  try {
    const tx = new TransactionBlock();
    
    const [upgradeCap] = tx.publish({
      modules,
      dependencies,
    });
    
    // Transfer the upgrade capability to the sender
    tx.transferObjects([upgradeCap], deployer.toSuiAddress());
    
    // Execute the transaction
    const result = await suiClient.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: deployer,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });
    
    if (result.effects?.status?.status === "success") {
      console.log("✅ Deployment successful!");
      console.log(`   Transaction: ${result.digest}`);
      
      // Extract package ID
      const packageId = result.objectChanges?.find(
        obj => obj.type === "published"
      )?.packageId;
      
      console.log(`   Package ID: ${packageId}`);
      
      // Find created objects
      const createdObjects = result.objectChanges?.filter(
        obj => obj.type === "created"
      ) || [];
      
      console.log("\n📋 Contract Addresses:");
      console.log("-".repeat(50));
      console.log(`Package ID: ${packageId}`);
      
      const addresses = {
        packageId: packageId,
        txDigest: result.digest,
        timestamp: new Date().toISOString()
      };
      
      for (const obj of createdObjects) {
        let contractName = "Unknown";
        
        if (obj.objectType.includes("::limit_order_protocol::LimitOrderProtocol")) {
          contractName = "LimitOrderProtocol";
        } else if (obj.objectType.includes("::escrow_factory::EscrowFactory")) {
          contractName = "EscrowFactory";
        } else if (obj.objectType.includes("::mock_usdt::Treasury")) {
          contractName = "MockUSDT";
        } else if (obj.objectType.includes("::mock_dai::Treasury")) {
          contractName = "MockDAI";
        } else if (obj.objectType.includes("::mock_wrapped_sui::Treasury")) {
          contractName = "MockWrappedSui";
        } else if (obj.objectType.includes("::mock_wrapped_sui::SuiVault")) {
          contractName = "SuiVault";
        }
        
        console.log(`${contractName}: ${obj.objectId}`);
        addresses[contractName] = obj.objectId;
      }
      
      // Save deployment results
      const deploymentFile = path.join(__dirname, "new_deployment.json");
      fs.writeFileSync(deploymentFile, JSON.stringify(addresses, null, 2));
      
      console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);
      console.log("\n🎉 All contracts deployed successfully!");
      
      return addresses;
      
    } else {
      console.log("❌ Deployment failed:", result.effects?.status);
    }
    
  } catch (error) {
    console.log("❌ Deployment error:", error.message);
    if (error.data) {
      console.log("   Error data:", error.data);
    }
  }
}

deployDirect().catch(console.error);