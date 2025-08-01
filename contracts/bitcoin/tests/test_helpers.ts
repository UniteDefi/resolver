import axios from "axios";
import { REGTEST_API_URL, REGTEST_RPC_USER, REGTEST_RPC_PASSWORD } from "./setup";

interface RPCResponse<T> {
  result: T;
  error: null | { code: number; message: string };
  id: string;
}

export async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  try {
    const response = await axios.post<RPCResponse<T>>(
      REGTEST_API_URL,
      {
        jsonrpc: "2.0",
        id: Date.now().toString(),
        method,
        params,
      },
      {
        auth: {
          username: REGTEST_RPC_USER,
          password: REGTEST_RPC_PASSWORD,
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data.error) {
      throw new Error(`RPC Error: ${response.data.error.message}`);
    }

    return response.data.result;
  } catch (error) {
    console.error(`[RPC Error] ${method}:`, error);
    throw error;
  }
}

export async function generateBlocks(count: number): Promise<string[]> {
  const address = await rpcCall<string>("getnewaddress");
  return rpcCall<string[]>("generatetoaddress", [count, address]);
}

export async function sendToAddress(address: string, amount: number): Promise<string> {
  return rpcCall<string>("sendtoaddress", [address, amount]);
}

export async function getRawTransaction(txid: string): Promise<string> {
  return rpcCall<string>("getrawtransaction", [txid]);
}

export async function sendRawTransaction(hexTx: string): Promise<string> {
  return rpcCall<string>("sendrawtransaction", [hexTx]);
}

export async function mineTransaction(txid: string): Promise<void> {
  await generateBlocks(1);
  console.log(`[Test Helper] Transaction ${txid} mined`);
}

export async function fundAddress(address: string, amount: number): Promise<{ txid: string; vout: number }> {
  const txid = await sendToAddress(address, amount);
  await mineTransaction(txid);
  
  const rawTx = await rpcCall<{
    vout: Array<{ value: number; n: number; scriptPubKey: { addresses?: string[] } }>;
  }>("getrawtransaction", [txid, true]);

  const vout = rawTx.vout.findIndex(
    (output) => output.scriptPubKey.addresses?.includes(address),
  );

  return { txid, vout };
}