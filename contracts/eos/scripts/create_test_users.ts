import { JsonRpc } from "eosjs";
import * as dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

async function createTestUsers() {
  const rpcEndpoint = process.env.EOS_RPC_ENDPOINT || "https://jungle4.greymass.com";
  const rpc = new JsonRpc(rpcEndpoint, { fetch: fetch as any });

  // Test accounts from .env
  const testAccounts = [
    {
      name: process.env.TEST_ACCOUNT1 || "unitedefiusr1",
      publicKey: process.env.TEST_ACCOUNT1_PUBLIC_KEY || "",
      privateKey: process.env.TEST_ACCOUNT1_PRIVATE_KEY || ""
    },
    {
      name: process.env.TEST_ACCOUNT2 || "unitedefiusr2", 
      publicKey: process.env.TEST_ACCOUNT2_PUBLIC_KEY || "",
      privateKey: process.env.TEST_ACCOUNT2_PRIVATE_KEY || ""
    }
  ];

  console.log("[Account Creation] Checking test accounts...\n");

  for (const account of testAccounts) {
    try {
      const accountInfo = await rpc.get_account(account.name);
      console.log(`[Account Creation] ✓ Account ${account.name} already exists`);
      console.log(`[Account Creation]   Created: ${accountInfo.created}`);
      
      // Check balance
      const balance = await rpc.get_currency_balance("eosio.token", account.name, "EOS");
      console.log(`[Account Creation]   Balance: ${balance.length > 0 ? balance[0] : "0.0000 EOS"}\n`);
      
    } catch (error: any) {
      if (error.json && error.json.error && error.json.error.code === 0) {
        console.log(`[Account Creation] ⚠ Account ${account.name} does not exist`);
        console.log(`[Account Creation]   Account name: ${account.name}`);
        console.log(`[Account Creation]   Public key: ${account.publicKey}`);
        console.log(`[Account Creation]   Please create this account manually on Jungle Testnet\n`);
      } else {
        console.error(`[Account Creation] ❌ Error checking account ${account.name}:`, error.message);
      }
    }
  }

  console.log("[Account Creation] To create accounts manually:");
  console.log("1. Go to https://monitor4.jungletestnet.io/#account");
  console.log("2. Click 'Create Account'");
  console.log("3. Use the account names and public keys shown above");
  console.log("4. Fund accounts using the faucet at https://monitor4.jungletestnet.io/#faucet");
}

createTestUsers().catch(console.error);