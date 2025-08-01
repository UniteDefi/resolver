import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import * as dotenv from "dotenv";

dotenv.config();

async function checkBalance() {
  const wsProvider = new WsProvider(process.env.TESTNET_WS_URL || "wss://westend-rpc.polkadot.io");
  const api = await ApiPromise.create({ provider: wsProvider });
  
  console.log("[Balance Check] Connected to:", (await api.rpc.system.chain()).toString());
  
  const keyring = new Keyring({ type: "sr25519" });
  const account = keyring.addFromUri(process.env.DEPLOYER_MNEMONIC || "");
  
  console.log("[Balance Check] Account address:", account.address);
  
  const accountInfo = await api.query.system.account(account.address);
  const balance = accountInfo as any;
  
  console.log("[Balance Check] Free balance:", balance.data.free.toHuman());
  console.log("[Balance Check] Reserved balance:", balance.data.reserved.toHuman());
  
  const totalBalance = balance.data.free.toBn().add(balance.data.reserved.toBn());
  console.log("[Balance Check] Total balance:", api.createType('Balance', totalBalance).toHuman());
  
  await api.disconnect();
}

checkBalance().catch(console.error);