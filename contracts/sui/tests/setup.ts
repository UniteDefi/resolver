import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

export interface TestEnvironment {
  client: SuiClient;
  keypair: Ed25519Keypair;
  deployerAddress: string;
  contracts: {
    escrowFactory: string;
    limitOrderProtocol: string;
    resolver: string;
    mockUsdc: string;
  };
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
  const network = process.env.SUI_NETWORK || "testnet";
  const client = new SuiClient({ url: getFullnodeUrl(network as any) });
  
  // Load or generate keypair
  let keypair: Ed25519Keypair;
  const privateKey = process.env.PRIVATE_KEY;
  
  if (privateKey) {
    keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
  } else {
    // Generate new keypair for testing
    keypair = new Ed25519Keypair();
    console.log("[Setup] Generated new keypair:", keypair.getPublicKey().toSuiAddress());
    console.log("[Setup] Private key:", Buffer.from(keypair.export().privateKey).toString("hex"));
  }
  
  const deployerAddress = keypair.getPublicKey().toSuiAddress();
  
  // Load deployed contracts
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const contracts = deployments[network];
  
  if (!contracts || !contracts.escrowFactory) {
    throw new Error(`Contracts not deployed on ${network}. Run deploy script first.`);
  }
  
  return {
    client,
    keypair,
    deployerAddress,
    contracts,
  };
}

export async function fundAccount(
  client: SuiClient,
  address: string,
  amount: number = 10000000000, // 10 SUI
): Promise<void> {
  // In testnet/devnet, use faucet
  const network = process.env.SUI_NETWORK || "testnet";
  if (network !== "mainnet") {
    console.log(`[Setup] Requesting ${amount / 1e9} SUI from faucet for ${address}`);
    // Note: Actual faucet implementation would go here
    // For now, assume account is already funded
  }
}

export function generateTestWallet(): Ed25519Keypair {
  return new Ed25519Keypair();
}

export async function mintMockUsdc(
  env: TestEnvironment,
  recipient: string,
  amount: number,
): Promise<string> {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${env.contracts.mockUsdc}::mock_usdc::mint_to`,
    arguments: [
      tx.object(env.contracts.mockUsdc), // Faucet object
      tx.pure(recipient),
      tx.pure(amount),
    ],
  });
  
  const result = await env.client.signAndExecuteTransactionBlock({
    signer: env.keypair,
    transactionBlock: tx,
    options: {
      showEffects: true,
    },
  });
  
  return result.digest;
}

export function createOrderHash(
  maker: string,
  makerAsset: string,
  takerAsset: string,
  makerAmount: bigint,
  takerAmount: bigint,
  nonce: bigint,
): string {
  // Simple hash for testing - in production use proper hashing
  const data = `${maker}${makerAsset}${takerAsset}${makerAmount}${takerAmount}${nonce}`;
  return Buffer.from(data).toString("hex").slice(0, 64);
}

export function createSecretAndHash(): { secret: string; hash: string } {
  // Generate random secret
  const secret = Buffer.from(Math.random().toString(36).substring(2, 15)).toString("hex");
  // For testing, hash is just the secret (in production, use proper hashing)
  const hash = secret;
  return { secret, hash };
}