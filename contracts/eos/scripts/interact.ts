import { Api, JsonRpc } from "eosjs";
import { JsSignatureProvider } from "eosjs/dist/eosjs-jssig";
import * as dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

// Command line interaction script
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log("Usage: ts-node interact.ts <action> <user> [value]");
    console.log("Actions: increment, decrement, reset, getvalue");
    console.log("Example: ts-node interact.ts increment alice");
    process.exit(1);
  }

  const action = args[0];
  const user = args[1];

  // Initialize connection
  const rpcEndpoint = process.env.EOS_RPC_ENDPOINT || "http://127.0.0.1:8888";
  const contractAccount = process.env.CONTRACT_ACCOUNT || "counter";
  const privateKey = process.env[`${user.toUpperCase()}_PRIVATE_KEY`] || process.env.TEST_ACCOUNT1_PRIVATE_KEY || "5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3";

  const rpc = new JsonRpc(rpcEndpoint, { fetch: fetch as any });
  const signatureProvider = new JsSignatureProvider([privateKey]);
  
  const api = new Api({
    rpc,
    signatureProvider,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder()
  });

  console.log(`[Interact] Executing ${action} for user ${user}...`);

  try {
    // Execute action
    const result = await api.transact({
      actions: [{
        account: contractAccount,
        name: action,
        authorization: [{
          actor: user,
          permission: "active"
        }],
        data: { user }
      }]
    }, {
      blocksBehind: 3,
      expireSeconds: 30
    });

    console.log(`[Interact] Transaction successful: ${result.transaction_id}`);

    // Get current counter value
    const tableResult = await rpc.get_table_rows({
      json: true,
      code: contractAccount,
      scope: contractAccount,
      table: "counters",
      lower_bound: user,
      upper_bound: user,
      limit: 1
    });

    if (tableResult.rows.length > 0) {
      console.log(`[Interact] Current counter value for ${user}: ${tableResult.rows[0].value}`);
    } else {
      console.log(`[Interact] No counter found for ${user}`);
    }

  } catch (error: any) {
    console.error("[Interact] Error:", error);
    if (error.json) {
      console.error("[Interact] Details:", JSON.stringify(error.json, null, 2));
    }
  }
}

main().catch(console.error);