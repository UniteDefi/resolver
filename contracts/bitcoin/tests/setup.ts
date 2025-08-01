import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

export const REGTEST_API_URL = process.env.REGTEST_API_URL || "http://localhost:18443";
export const REGTEST_RPC_USER = process.env.REGTEST_RPC_USER || "rpcuser";
export const REGTEST_RPC_PASSWORD = process.env.REGTEST_RPC_PASSWORD || "rpcpassword";

beforeAll(() => {
  console.log("[Test Setup] Bitcoin regtest environment initialized");
});