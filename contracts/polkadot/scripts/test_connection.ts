import { ApiPromise, WsProvider } from "@polkadot/api";
import * as dotenv from "dotenv";

dotenv.config();

async function testConnection() {
  console.log("[Test] Connecting to Westend testnet...");
  
  const wsProvider = new WsProvider(process.env.TESTNET_WS_URL || "wss://westend-rpc.polkadot.io");
  const api = await ApiPromise.create({ provider: wsProvider });
  
  console.log("[Test] Successfully connected!");
  
  const chain = await api.rpc.system.chain();
  const nodeName = await api.rpc.system.name();
  const nodeVersion = await api.rpc.system.version();
  const chainProperties = await api.rpc.system.properties();
  
  console.log("[Test] Chain:", chain.toString());
  console.log("[Test] Node name:", nodeName.toString());
  console.log("[Test] Node version:", nodeVersion.toString());
  console.log("[Test] Chain properties:", chainProperties.toHuman());
  
  const lastHeader = await api.rpc.chain.getHeader();
  console.log("[Test] Latest block number:", lastHeader.number.toHuman());
  console.log("[Test] Latest block hash:", lastHeader.hash.toHex());
  
  await api.disconnect();
  console.log("[Test] Disconnected successfully!");
}

testConnection().catch(console.error);