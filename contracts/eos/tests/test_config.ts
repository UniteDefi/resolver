import { Api, JsonRpc, RpcError } from "eosjs";
import { JsSignatureProvider } from "eosjs/dist/eosjs-jssig";
import * as dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

export interface TestConfig {
  rpc: JsonRpc;
  api: Api;
  contractAccount: string;
  testAccounts: string[];
}

export function getTestConfig(): TestConfig {
  const rpcEndpoint = process.env.EOS_RPC_ENDPOINT || "http://127.0.0.1:8888";
  const contractAccount = process.env.CONTRACT_ACCOUNT || "counter";
  
  // Test account private keys
  const defaultPrivateKeys = [
    process.env.CONTRACT_PRIVATE_KEY || "5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3",
    process.env.TEST_ACCOUNT1_PRIVATE_KEY || "5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3",
    process.env.TEST_ACCOUNT2_PRIVATE_KEY || "5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3"
  ];

  const testAccounts = [
    process.env.TEST_ACCOUNT1 || "alice",
    process.env.TEST_ACCOUNT2 || "bob"
  ];

  const rpc = new JsonRpc(rpcEndpoint, { fetch: fetch as any });
  const signatureProvider = new JsSignatureProvider(defaultPrivateKeys);
  
  const api = new Api({
    rpc,
    signatureProvider,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder()
  });

  return {
    rpc,
    api,
    contractAccount,
    testAccounts
  };
}

export async function getTableRows(
  rpc: JsonRpc,
  code: string,
  scope: string,
  table: string,
  limit: number = 10
): Promise<any> {
  try {
    const result = await rpc.get_table_rows({
      json: true,
      code,
      scope,
      table,
      limit
    });
    return result.rows;
  } catch (error) {
    console.error("[getTableRows] Error:", error);
    throw error;
  }
}

export async function transact(
  api: Api,
  actions: any[]
): Promise<any> {
  try {
    const result = await api.transact(
      { actions },
      {
        blocksBehind: 3,
        expireSeconds: 30
      }
    );
    return result;
  } catch (error) {
    if (error instanceof RpcError) {
      console.error("[transact] RPC Error:", JSON.stringify(error.json, null, 2));
    } else {
      console.error("[transact] Error:", error);
    }
    throw error;
  }
}