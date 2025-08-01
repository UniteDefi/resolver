import { connect, keyStores, KeyPair, Near, Account } from "near-api-js";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

config();

export interface TestConfig {
  networkId: string;
  nodeUrl: string;
  masterAccount: string;
  contractName?: string;
}

export async function createTestNearConnection(): Promise<Near> {
  const keyStore = new keyStores.InMemoryKeyStore();
  
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  const nodeUrl = process.env.NEAR_NODE_URL || "https://rpc.testnet.near.org";
  
  return await connect({
    networkId,
    keyStore,
    nodeUrl,
    walletUrl: `https://wallet.${networkId}.near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
  });
}

export async function deployContract(
  near: Near,
  contractId: string,
  wasmPath: string
): Promise<Account> {
  const masterAccount = await near.account(process.env.NEAR_MASTER_ACCOUNT || "test.near");
  
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey();
  
  await masterAccount.createAccount(
    contractId,
    publicKey,
    "10000000000000000000000000" // 10 NEAR
  );
  
  const contractAccount = await near.account(contractId);
  
  const contractWasm = readFileSync(wasmPath);
  await contractAccount.deployContract(contractWasm);
  
  return contractAccount;
}

export function generateUniqueAccountId(prefix: string = "test"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}.testnet`;
}