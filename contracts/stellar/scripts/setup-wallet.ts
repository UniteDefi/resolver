#!/usr/bin/env ts-node

import { Keypair } from "@stellar/stellar-sdk";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import fetch from "node-fetch";
import * as dotenv from "dotenv";

dotenv.config();

async function setupWallet() {
  console.log("[Setup] Setting up Stellar wallet from mnemonic...");

  const mnemonic = "fuel coyote eagle enter lazy lesson cloth few swift wear truth nature";
  
  // Generate seed from mnemonic
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  
  // Derive key using Stellar's HD path (m/44'/148'/0')
  const derivedKey = derivePath("m/44'/148'/0'", seed.toString("hex"));
  
  // Create keypair from derived seed
  const keypair = Keypair.fromRawEd25519Seed(derivedKey.key);
  
  console.log("[Setup] Generated wallet details:");
  console.log("[Setup] Public Key:", keypair.publicKey());
  console.log("[Setup] Secret Key:", keypair.secret());
  
  // Verify it matches the expected address
  const expectedAddress = "GABMJQZFSEXOGCX5KDZGCQXSAM4YYIDWTBSOPU5GPWBJDYH4RLT7KCEY";
  if (keypair.publicKey() === expectedAddress) {
    console.log("[Setup] ✅ Address matches expected value!");
  } else {
    console.log("[Setup] ⚠️  Warning: Address does not match expected value");
    console.log("[Setup] Expected:", expectedAddress);
    console.log("[Setup] Got:", keypair.publicKey());
  }

  // Fund the account using Friendbot
  console.log("[Setup] Funding account with testnet XLM...");
  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${keypair.publicKey()}`
    );
    
    if (response.ok) {
      console.log("[Setup] ✅ Account funded successfully!");
      const data = await response.json() as any;
      console.log("[Setup] Transaction hash:", data.hash);
    } else {
      console.log("[Setup] ❌ Failed to fund account:", response.statusText);
      console.log("[Setup] The account might already be funded.");
    }
  } catch (error) {
    console.error("[Setup] Error funding account:", error);
    console.log("[Setup] You can manually fund at: https://laboratory.stellar.org/#account-creator");
  }

  // Check account balance
  console.log("[Setup] Checking account balance...");
  try {
    const horizonResponse = await fetch(
      `https://horizon-testnet.stellar.org/accounts/${keypair.publicKey()}`
    );
    
    if (horizonResponse.ok) {
      const accountData = await horizonResponse.json() as any;
      const xlmBalance = accountData.balances.find(
        (b: any) => b.asset_type === "native"
      );
      console.log("[Setup] Current XLM balance:", xlmBalance.balance);
    } else {
      console.log("[Setup] Could not fetch account balance");
    }
  } catch (error) {
    console.error("[Setup] Error checking balance:", error);
  }

  // Save the secret key to .env file
  console.log("\n[Setup] Add this to your .env file:");
  console.log(`STELLAR_SECRET_KEY=${keypair.secret()}`);
  console.log("\n[Setup] Network URLs:");
  console.log("HORIZON_TESTNET_URL=https://horizon-testnet.stellar.org");
  console.log("SOROBAN_TESTNET_URL=https://soroban-testnet.stellar.org");
  
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

// Run setup
setupWallet().catch(error => {
  console.error("[Setup] Unexpected error:", error);
  process.exit(1);
});