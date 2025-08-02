import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function fundResolvers() {
  const network = process.env.SUI_NETWORK || "testnet";
  const client = new SuiClient({ url: getFullnodeUrl(network as any) });
  
  // Load deployer keypair
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not found in .env");
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  const deployerAddress = keypair.getPublicKey().toSuiAddress();
  
  // Load deployments
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  
  const mockUsdcAddress = deployments[network].mockUsdc;
  if (!mockUsdcAddress) {
    throw new Error("Mock USDC not deployed on " + network);
  }
  
  // Fund amount per resolver
  const fundingAmount = process.env.DEMO_FUNDING_AMOUNT || "1000000000"; // 1000 USDC with 6 decimals
  const resolverCount = parseInt(process.env.DEMO_RESOLVER_COUNT || "3");
  
  console.log(`[FundResolvers] Funding ${resolverCount} resolvers with ${fundingAmount} mock USDC each`);
  
  for (let i = 0; i < resolverCount; i++) {
    const resolverKeypair = new Ed25519Keypair();
    const resolverAddress = resolverKeypair.getPublicKey().toSuiAddress();
    
    console.log(`[FundResolvers] Resolver ${i + 1} address:`, resolverAddress);
    console.log(`[FundResolvers] Private key:`, Buffer.from(resolverKeypair.export().privateKey).toString("hex"));
    
    const tx = new TransactionBlock();
    
    // Transfer mock USDC to resolver
    const [coin] = tx.splitCoins(tx.object(mockUsdcAddress), [tx.pure(fundingAmount)]);
    tx.transferObjects([coin], tx.pure(resolverAddress));
    
    // Also send some SUI for gas
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure(100000000)]); // 0.1 SUI
    tx.transferObjects([suiCoin], tx.pure(resolverAddress));
    
    const result = await client.signAndExecuteTransactionBlock({
      signer: keypair,
      transactionBlock: tx,
      options: {
        showEffects: true,
      },
    });
    
    console.log(`[FundResolvers] Funded resolver ${i + 1}:`, result.digest);
  }
  
  console.log("[FundResolvers] All resolvers funded successfully");
}

fundResolvers().catch(console.error);