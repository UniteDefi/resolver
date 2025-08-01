import { execSync } from "child_process";
import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

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

  const balance = await client.getBalance({
    owner: address,
  });
  console.log("[Deploy] Balance:", balance.totalBalance, "MIST");

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

  console.log("[Deploy] Publishing package...");
  try {
    const publishOutput = execSync(
      `sui client publish --gas-budget 100000000 --json`,
      { 
        cwd: path.join(__dirname, ".."),
        encoding: "utf-8"
      }
    );

    const publishResult = JSON.parse(publishOutput);
    console.log("[Deploy] Publish result:", publishResult);

    if (publishResult.objectChanges) {
      const packageChange = publishResult.objectChanges.find(
        (change: any) => change.type === "published"
      );
      
      if (packageChange) {
        const packageId = packageChange.packageId;
        console.log("[Deploy] Package ID:", packageId);
        
        const sharedObject = publishResult.objectChanges.find(
          (change: any) => change.type === "created" && change.owner?.Shared
        );
        
        if (sharedObject) {
          console.log("[Deploy] Counter Object ID:", sharedObject.objectId);
          
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
    }
  } catch (error: any) {
    console.error("[Deploy] Publish failed:", error.message);
    process.exit(1);
  }
}

deploy().catch(console.error);