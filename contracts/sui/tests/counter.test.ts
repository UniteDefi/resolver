import { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { requestSuiFromFaucetV0, getFaucetHost } from "@mysten/sui.js/faucet";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

describe("Counter Tests", () => {
  let client: SuiClient;
  let keypair: Ed25519Keypair;
  let packageId: string;
  let counterId: string;

  beforeAll(async () => {
    const rpcUrl = process.env.SUI_RPC_URL || "https://fullnode.devnet.sui.io";
    const network = process.env.SUI_NETWORK || "devnet";
    
    client = new SuiClient({ url: rpcUrl });
    
    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (privateKey) {
      keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
    } else {
      keypair = new Ed25519Keypair();
      console.log("[Test Setup] Generated new keypair:", keypair.toSuiAddress());
    }

    const address = keypair.toSuiAddress();
    console.log("[Test Setup] Using address:", address);

    packageId = process.env.COUNTER_PACKAGE_ID || "";
    counterId = process.env.COUNTER_OBJECT_ID || "";
    
    if (!packageId || !counterId) {
      throw new Error("COUNTER_PACKAGE_ID or COUNTER_OBJECT_ID not set in environment");
    }
    
    console.log("[Test Setup] Package ID:", packageId);
    console.log("[Test Setup] Counter ID:", counterId);
  });

  test("should create and increment counter", async () => {
    const tx = new TransactionBlock();
    
    tx.moveCall({
      target: `${packageId}::counter::increment`,
      arguments: [tx.object(counterId)],
    });

    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log("[Test/Increment] Transaction result:", result);
    expect(result.effects?.status.status).toBe("success");
  });

  test("should decrement counter", async () => {
    const tx = new TransactionBlock();
    
    tx.moveCall({
      target: `${packageId}::counter::decrement`,
      arguments: [tx.object(counterId)],
    });

    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log("[Test/Decrement] Transaction result:", result);
    expect(result.effects?.status.status).toBe("success");
  });

  test("should get counter value", async () => {
    const counterObject = await client.getObject({
      id: counterId,
      options: {
        showContent: true,
      },
    });

    console.log("[Test/GetValue] Counter object:", counterObject);
    expect(counterObject.data).toBeDefined();
  });
});