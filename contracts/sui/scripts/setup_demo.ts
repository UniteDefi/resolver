import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function setupDemo() {
  const network = process.env.SUI_NETWORK || "testnet";
  const client = new SuiClient({ url: getFullnodeUrl(network as any) });
  
  // Load deployer keypair
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env");
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  const deployerAddress = keypair.getPublicKey().toSuiAddress();
  
  console.log("[SetupDemo] Setting up demo environment");
  console.log("[SetupDemo] Network:", network);
  console.log("[SetupDemo] Deployer:", deployerAddress);
  
  // Load deployments
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  
  const contracts = deployments[network];
  if (!contracts.escrowFactory || !contracts.limitOrderProtocol || !contracts.resolver) {
    throw new Error("Contracts not deployed on " + network);
  }
  
  console.log("[SetupDemo] Contracts loaded:");
  console.log("  - Escrow Factory:", contracts.escrowFactory);
  console.log("  - Limit Order Protocol:", contracts.limitOrderProtocol);
  console.log("  - Resolver:", contracts.resolver);
  console.log("  - Mock USDC:", contracts.mockUsdc);
  
  // Create demo orders
  const tx = new TransactionBlock();
  
  // TODO: Add demo order creation logic here
  // This would involve:
  // 1. Creating limit orders on the protocol
  // 2. Setting up cross-chain escrows
  // 3. Configuring resolver permissions
  
  console.log("[SetupDemo] Demo setup complete");
  console.log("[SetupDemo] You can now run tests or interact with the contracts");
}

setupDemo().catch(console.error);