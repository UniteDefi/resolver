import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { char2Bytes } from "@taquito/utils";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface CounterStorage {
  value: number;
}

interface CounterContract {
  methods: {
    increment: (value: number) => any;
    decrement: (value: number) => any;
  };
  storage: () => Promise<number>;
}

describe("Counter Contract Tests", () => {
  let tezos: TezosToolkit;
  let contract: CounterContract;
  let contractAddress: string;

  beforeAll(async () => {
    // Initialize Tezos toolkit with local sandbox
    const rpcUrl = process.env.TEZOS_RPC_URL || "http://localhost:20000";
    tezos = new TezosToolkit(rpcUrl);

    // Set up signer with test account
    const secretKey = process.env.TEZOS_SECRET_KEY || "edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq";
    tezos.setProvider({
      signer: new InMemorySigner(secretKey),
    });

    console.log("[Counter Test] Deploying contract...");

    // Read compiled contract
    const contractPath = path.join(__dirname, "../output/counter/simple_counter.json");
    const contractCode = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    // Deploy contract
    const origination = await tezos.contract.originate({
      code: contractCode,
      storage: 10, // Initial value (just a nat)
    });

    await origination.confirmation();
    contractAddress = origination.contractAddress!;
    
    console.log("[Counter Test] Contract deployed at:", contractAddress);

    // Get contract instance
    contract = await tezos.contract.at(contractAddress) as any;
  });

  test("should have initial value of 10", async () => {
    const storage = await contract.storage();
    expect(storage.toNumber()).toBe(10);
  });

  test("should increment value", async () => {
    console.log("[Counter Test] Testing increment...");
    
    const operation = await contract.methods.increment(5).send();
    await operation.confirmation();

    const storage = await contract.storage();
    expect(storage.toNumber()).toBe(15);
  });

  test("should decrement value", async () => {
    console.log("[Counter Test] Testing decrement...");
    
    const operation = await contract.methods.decrement(3).send();
    await operation.confirmation();

    const storage = await contract.storage();
    expect(storage.toNumber()).toBe(12);
  });

  test("should handle decrementing below zero", async () => {
    console.log("[Counter Test] Testing decrement below zero...");
    
    // Decrement by 20 when value is 12, should result in 0 (ABS operation)
    const operation = await contract.methods.decrement(20).send();
    await operation.confirmation();
    
    const storage = await contract.storage();
    expect(storage.toNumber()).toBe(0);
  });

});