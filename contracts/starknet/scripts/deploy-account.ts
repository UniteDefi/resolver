import { Account, ec, json, stark, RpcProvider, hash, CallData } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function deployAccount() {
  console.log("[Account] Deploying StarkNet account...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  const publicKey = process.env.STARKNET_PUBLIC_KEY;
  const classHash = process.env.STARKNET_ACCOUNT_CLASS_HASH;
  
  if (!privateKey || !accountAddress || !publicKey || !classHash) {
    throw new Error("Missing required environment variables. Please run generate-wallet.ts first.");
  }
  
  console.log(`[Account] Account address: ${accountAddress}`);
  
  // Check if account is already deployed
  try {
    const code = await provider.getClassAt(accountAddress);
    if (code) {
      console.log("[Account] ✅ Account is already deployed!");
      return;
    }
  } catch (error) {
    console.log("[Account] Account not deployed yet, proceeding with deployment...");
  }
  
  // Create account instance with version 3
  const account = new Account(provider, accountAddress, privateKey, "1");
  
  // Deploy account
  try {
    const accountDeployPayload = {
      classHash: classHash,
      constructorCalldata: CallData.compile({ publicKey: publicKey }),
      addressSalt: publicKey,
      contractAddress: accountAddress,
    };
    
    console.log("[Account] Submitting deployment transaction...");
    const { transaction_hash: deployTxHash } = await account.deployAccount(accountDeployPayload, {
      maxFee: "0x11111111111111",
      version: "0x3"
    });
    
    console.log(`[Account] Transaction hash: ${deployTxHash}`);
    console.log("[Account] Waiting for transaction confirmation...");
    
    await provider.waitForTransaction(deployTxHash);
    
    console.log("[Account] ✅ Account deployed successfully!");
    console.log(`[Account] Address: ${accountAddress}`);
    console.log(`[Account] Explorer: https://sepolia.starkscan.co/contract/${accountAddress}`);
    
    // Update wallet info
    const walletPath = path.join(__dirname, "../wallet-info.json");
    if (fs.existsSync(walletPath)) {
      const walletInfo = JSON.parse(fs.readFileSync(walletPath, "utf8"));
      walletInfo.status = "DEPLOYED";
      walletInfo.deploymentTx = deployTxHash;
      walletInfo.deployedAt = new Date().toISOString();
      fs.writeFileSync(walletPath, JSON.stringify(walletInfo, null, 2));
    }
    
  } catch (error: any) {
    if (error.message?.includes("insufficient balance")) {
      console.error("\n[Account] ❌ Insufficient balance!");
      console.error("[Account] Please fund your account with ETH first:");
      console.error(`[Account] Address: ${accountAddress}`);
      console.error("[Account] Use one of these faucets:");
      console.error("  - https://faucet.starknet.io/");
      console.error("  - https://starknet-faucet.vercel.app/");
    } else {
      console.error("[Account] Deployment failed:", error);
    }
    process.exit(1);
  }
}

deployAccount().catch(console.error);