import { connect, keyStores, KeyPair, utils } from "near-api-js";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { homedir } from "os";

config();

async function createAccount() {
  const accountId = "unite-defi-test-1754059525.testnet";
  const networkId = "testnet";
  
  console.log("[CreateAccount] Attempting to create account:", accountId);
  
  // Load existing keypair from credentials
  const credentialsPath = join(homedir(), ".near-credentials", networkId, `${accountId}.json`);
  const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
  
  // Create in-memory keystore and add the key
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(credentials.private_key);
  await keyStore.setKey(networkId, accountId, keyPair);
  
  const near = await connect({
    networkId,
    keyStore,
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
  });
  
  try {
    // Try to create account via helper
    const response = await fetch("https://helper.testnet.near.org/account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newAccountId: accountId,
        newAccountPublicKey: credentials.public_key,
      }),
    });
    
    if (response.ok) {
      console.log("[CreateAccount] ✅ Account created successfully!");
      const account = await near.account(accountId);
      const state = await account.state();
      console.log("[CreateAccount] Account balance:", utils.format.formatNearAmount(state.amount));
    } else {
      const error = await response.text();
      console.error("[CreateAccount] ❌ Failed to create account:", error);
      console.log("[CreateAccount] Please use the testnet wallet or faucet to fund the account manually");
    }
  } catch (error) {
    console.error("[CreateAccount] Error:", error);
    console.log("\n[CreateAccount] Alternative: Please visit https://wallet.testnet.near.org/");
    console.log("[CreateAccount] And create/fund the account manually with ID:", accountId);
  }
}

createAccount().catch(console.error);