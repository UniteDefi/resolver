import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

async function fundAddress(address: string, amount: number): Promise<void> {
  const rpcUrl = process.env.REGTEST_API_URL || "http://localhost:18443";
  const rpcUser = process.env.REGTEST_RPC_USER || "rpcuser";
  const rpcPassword = process.env.REGTEST_RPC_PASSWORD || "rpcpassword";
  
  try {
    console.log("[Fund Address] Funding address:", address);
    console.log("[Fund Address] Amount:", amount, "BTC");
    
    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: Date.now().toString(),
        method: "sendtoaddress",
        params: [address, amount],
      },
      {
        auth: {
          username: rpcUser,
          password: rpcPassword,
        },
      },
    );
    
    const txid = response.data.result;
    console.log("[Fund Address] Transaction sent!");
    console.log("[Fund Address] TxID:", txid);
    
    console.log("[Fund Address] Mining block to confirm transaction...");
    await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: Date.now().toString(),
        method: "generatetoaddress",
        params: [1, address],
      },
      {
        auth: {
          username: rpcUser,
          password: rpcPassword,
        },
      },
    );
    
    console.log("[Fund Address] Transaction confirmed!");
  } catch (error) {
    if (error instanceof Error) {
      console.error("[Fund Address] Error:", error.message);
    } else if (typeof error === "object" && error !== null && "response" in error) {
      console.error("[Fund Address] Error:", (error as { response?: { data?: unknown } }).response?.data);
    } else {
      console.error("[Fund Address] Error:", error);
    }
  }
}

async function main(): Promise<void> {
  const address = process.argv[2];
  const amount = parseFloat(process.argv[3] || "0.1");
  
  if (!address) {
    console.error("Usage: ts-node fund_address.ts <address> [amount]");
    console.error("Example: ts-node fund_address.ts bcrt1q... 0.1");
    process.exit(1);
  }
  
  await fundAddress(address, amount);
}

main().catch(console.error);