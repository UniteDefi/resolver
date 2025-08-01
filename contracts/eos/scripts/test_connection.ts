import { JsonRpc } from "eosjs";
import * as dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

async function testConnection() {
  const rpcEndpoint = process.env.EOS_RPC_ENDPOINT || "https://jungle4.greymass.com";
  const contractAccount = process.env.CONTRACT_ACCOUNT || "unitedefidep";

  console.log("[Connection Test] Testing connection to:", rpcEndpoint);
  console.log("[Connection Test] Contract account:", contractAccount);

  const rpc = new JsonRpc(rpcEndpoint, { fetch: fetch as any });

  try {
    // Test basic connection
    const info = await rpc.get_info();
    console.log("[Connection Test] ✓ Connected to blockchain");
    console.log("[Connection Test] Chain ID:", info.chain_id);
    console.log("[Connection Test] Head block:", info.head_block_num);

    // Test account exists
    const accountInfo = await rpc.get_account(contractAccount);
    console.log("[Connection Test] ✓ Account exists");
    console.log("[Connection Test] Account name:", accountInfo.account_name);
    console.log("[Connection Test] Account created:", accountInfo.created);
    
    // Check account balance
    const balance = await rpc.get_currency_balance("eosio.token", contractAccount, "EOS");
    console.log("[Connection Test] Account balance:", balance.length > 0 ? balance[0] : "0.0000 EOS");

    // Check if contract is already deployed
    const codeHash = (accountInfo as any).code_hash;
    if (codeHash && codeHash !== "0000000000000000000000000000000000000000000000000000000000000000") {
      console.log("[Connection Test] ✓ Contract code is deployed");
      console.log("[Connection Test] Code hash:", codeHash);
      
      // Try to get table rows if contract exists
      try {
        const rows = await rpc.get_table_rows({
          json: true,
          code: contractAccount,
          scope: contractAccount,
          table: "counters",
          limit: 10
        });
        console.log("[Connection Test] ✓ Contract table accessible");
        console.log("[Connection Test] Table rows:", rows.rows.length);
      } catch (e) {
        console.log("[Connection Test] ⚠ Contract table not found (contract may not be deployed)");
      }
    } else {
      console.log("[Connection Test] ⚠ No contract code deployed");
    }

    console.log("\n[Connection Test] ✅ All connection tests passed!");
    return true;

  } catch (error: any) {
    console.error("[Connection Test] ❌ Connection failed:", error.message);
    if (error.json) {
      console.error("[Connection Test] Error details:", JSON.stringify(error.json, null, 2));
    }
    return false;
  }
}

testConnection().catch(console.error);