import { connect, keyStores } from "near-api-js";
import { join } from "path";
import { config } from "dotenv";

config();

async function verifyWallet(): Promise<void> {
  console.log("[VerifyWallet] Starting wallet verification...");
  
  const accountId = process.env.NEAR_ACCOUNT_ID;
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  
  if (!accountId) {
    throw new Error("NEAR_ACCOUNT_ID not found in .env file");
  }
  
  console.log(`[VerifyWallet] Account ID: ${accountId}`);
  console.log(`[VerifyWallet] Network: ${networkId}`);
  
  // Initialize keystore
  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    join(process.env.HOME || "", ".near-credentials")
  );
  
  // Connect to NEAR
  const near = await connect({
    networkId,
    keyStore,
    nodeUrl: process.env.NEAR_NODE_URL || `https://rpc.${networkId}.near.org`,
    walletUrl: `https://wallet.${networkId}.near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
  });
  
  try {
    // Check if we have access to the account
    const account = await near.account(accountId);
    
    // Try to get account state
    let accountDoesNotExist = false;
    try {
      const state = await account.state();
      console.log(`[VerifyWallet] ✅ Account exists and is funded`);
      console.log(`[VerifyWallet] Balance: ${state.amount} yoctoNEAR`);
      console.log(`[VerifyWallet] Storage used: ${state.storage_usage} bytes`);
    } catch (error: any) {
      if (error.type === "AccountDoesNotExist") {
        accountDoesNotExist = true;
        console.log(`[VerifyWallet] ⚠️  Account exists in keystore but not on blockchain yet`);
        console.log(`[VerifyWallet] Account needs to be funded to exist on blockchain`);
      } else {
        throw error;
      }
    }
    
    // Verify keystore access
    const keyPair = await keyStore.getKey(networkId, accountId);
    console.log(`[VerifyWallet] ✅ Private key found in keystore`);
    console.log(`[VerifyWallet] Public key: ${keyPair.getPublicKey().toString()}`);
    
    console.log("\n" + "=".repeat(60));
    console.log("🔐 WALLET VERIFICATION COMPLETE");
    console.log("=".repeat(60));
    console.log(`Account: ${accountId}`);
    console.log(`Network: ${networkId}`);
    console.log(`Explorer: https://explorer.${networkId}.near.org/accounts/${accountId}`);
    
    if (accountDoesNotExist) {
      console.log("\n💰 TO ACTIVATE YOUR ACCOUNT:");
      console.log("1. Visit https://wallet.testnet.near.org/");
      console.log("2. Click 'Import Existing Account'");
      console.log("3. Enter your account ID and private key");
      console.log("4. Or send NEAR tokens to your account ID");
    }
    
  } catch (error: any) {
    console.error("[VerifyWallet] Error:", error.message);
    
    if (error.type === "KeyNotFound") {
      console.error("[VerifyWallet] ❌ Private key not found in keystore");
      console.error("[VerifyWallet] Run 'npm run generate-wallet' to create a new wallet");
    }
    
    throw error;
  }
}

verifyWallet().catch((error) => {
  console.error("[VerifyWallet] Verification failed:", error);
  process.exit(1);
});