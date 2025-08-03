#!/usr/bin/env npx tsx
import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

async function mintTokensToAll() {
  console.log("🪙 Starting token minting to all wallets...");

  const network = (process.env.APTOS_NETWORK as Network) || Network.TESTNET;
  const config = new AptosConfig({ network });
  const aptos = new Aptos(config);

  // Load deployment info
  const deploymentsPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const deployment = deployments.aptos[network];
  
  if (!deployment) {
    throw new Error(`No deployment found for network: ${network}`);
  }

  const packageAddress = deployment.packageAddress;

  // Setup deployer account
  const privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("APTOS_PRIVATE_KEY not found in environment variables");
  }

  const deployer = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });

  console.log("[MintTokens] Deployer address:", deployer.accountAddress.toString());
  console.log("[MintTokens] Package address:", packageAddress);

  // Get all wallet addresses
  const wallets: { name: string; address: string }[] = [];
  
  // Add user if available
  const userKey = process.env.APTOS_USER_PRIVATE_KEY;
  if (userKey) {
    const user = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(userKey),
    });
    wallets.push({ name: "User", address: user.accountAddress.toString() });
  }

  // Add resolvers
  for (let i = 0; i < 4; i++) {
    const resolverKey = process.env[`APTOS_RESOLVER_PRIVATE_KEY_${i}`];
    if (resolverKey) {
      const resolver = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(resolverKey),
      });
      wallets.push({ 
        name: `Resolver${i}`, 
        address: resolver.accountAddress.toString() 
      });
    }
  }

  if (wallets.length === 0) {
    console.log("❌ No wallets found. Set APTOS_USER_PRIVATE_KEY and/or APTOS_RESOLVER_PRIVATE_KEY_* in .env");
    return;
  }

  console.log(`[MintTokens] Found ${wallets.length} wallets to mint to`);

  const tokenAmount = 10000 * 1e6; // 10,000 tokens (6 decimals)

  // Mint to each wallet
  for (const wallet of wallets) {
    console.log(`\n[MintTokens] Processing ${wallet.name}: ${wallet.address}`);

    try {
      // Mint USDT
      console.log(`[MintTokens] Minting USDT to ${wallet.name}...`);
      const mintUSDTTxn = await aptos.transaction.build.simple({
        sender: deployer.accountAddress,
        data: {
          function: `${packageAddress}::test_coin::mint_usdt`,
          functionArguments: [
            wallet.address,
            tokenAmount.toString(),
          ],
        },
      });

      const usdtResult = await aptos.signAndSubmitTransaction({
        signer: deployer,
        transaction: mintUSDTTxn,
      });

      await aptos.waitForTransaction({
        transactionHash: usdtResult.hash,
      });

      console.log(`[MintTokens] ✅ USDT minted to ${wallet.name}`);

      // Mint DAI
      console.log(`[MintTokens] Minting DAI to ${wallet.name}...`);
      const mintDAITxn = await aptos.transaction.build.simple({
        sender: deployer.accountAddress,
        data: {
          function: `${packageAddress}::test_coin::mint_dai`,
          functionArguments: [
            wallet.address,
            tokenAmount.toString(),
          ],
        },
      });

      const daiResult = await aptos.signAndSubmitTransaction({
        signer: deployer,
        transaction: mintDAITxn,
      });

      await aptos.waitForTransaction({
        transactionHash: daiResult.hash,
      });

      console.log(`[MintTokens] ✅ DAI minted to ${wallet.name}`);

    } catch (error) {
      console.error(`[MintTokens] ❌ Failed to mint to ${wallet.name}:`, error);
    }
  }

  console.log("\n✅ TOKEN MINTING COMPLETE");
  console.log("All wallets received:");
  console.log("- 10,000 USDT");
  console.log("- 10,000 DAI");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mintTokensToAll().catch(error => {
    console.error("Failed to mint tokens:", error);
    process.exit(1);
  });
}

export { mintTokensToAll };