import { connect, keyStores, utils, Contract } from "near-api-js";
import { readFileSync } from "fs";
import { join } from "path";

interface CounterContract extends Contract {
  increment(): Promise<void>;
  decrement(): Promise<void>;
  get_value(): Promise<number>;
  reset(): Promise<void>;
}

describe("Counter Contract", () => {
  let contract: CounterContract;
  let accountId: string;
  
  beforeAll(async () => {
    const keyStore = new keyStores.InMemoryKeyStore();
    const config = {
      networkId: "testnet",
      keyStore,
      nodeUrl: "https://rpc.testnet.near.org",
      walletUrl: "https://wallet.testnet.near.org",
      helperUrl: "https://helper.testnet.near.org",
    };

    const near = await connect(config);
    
    accountId = `test-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    
    const testAccount = await near.account("test.near");
    
    const contractWasm = readFileSync(
      join(__dirname, "../target/wasm32-unknown-unknown/release/counter.wasm")
    );

    const newAccount = await testAccount.createAndDeployContract(
      accountId,
      utils.KeyPair.fromRandom("ed25519").getPublicKey(),
      contractWasm,
      utils.format.parseNearAmount("10") || "0"
    );

    contract = new Contract(newAccount, accountId, {
      viewMethods: ["get_value"],
      changeMethods: ["increment", "decrement", "reset"],
    }) as CounterContract;
  });

  test("should initialize with value 0", async () => {
    const value = await contract.get_value();
    expect(value).toBe(0);
  });

  test("should increment counter", async () => {
    await contract.increment();
    const value = await contract.get_value();
    expect(value).toBe(1);
  });

  test("should increment multiple times", async () => {
    await contract.increment();
    await contract.increment();
    const value = await contract.get_value();
    expect(value).toBe(3);
  });

  test("should decrement counter", async () => {
    await contract.decrement();
    const value = await contract.get_value();
    expect(value).toBe(2);
  });

  test("should reset counter to 0", async () => {
    await contract.reset();
    const value = await contract.get_value();
    expect(value).toBe(0);
  });

  test("should panic when decrementing below zero", async () => {
    await expect(contract.decrement()).rejects.toThrow();
  });
});