import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { ContractPromise } from "@polkadot/api-contract";
import { KeyringPair } from "@polkadot/keyring/types";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

describe("Counter Contract Tests", () => {
  let api: ApiPromise;
  let contract: ContractPromise;
  let deployer: KeyringPair;
  let alice: KeyringPair;
  let bob: KeyringPair;

  beforeAll(async () => {
    const wsProvider = new WsProvider(process.env.SUBSTRATE_WS_URL || "ws://127.0.0.1:9944");
    api = await ApiPromise.create({ provider: wsProvider });

    const keyring = new Keyring({ type: "sr25519" });
    deployer = keyring.addFromUri("//Alice");
    alice = keyring.addFromUri("//Alice");
    bob = keyring.addFromUri("//Bob");

    console.log("[Test Setup] Connected to Substrate node");
  });

  afterAll(async () => {
    await api.disconnect();
  });

  describe("Contract Deployment", () => {
    it("should deploy counter contract with initial value", async () => {
      const contractPath = path.join(__dirname, "../counter/target/ink/counter.contract");
      
      if (!fs.existsSync(contractPath)) {
        throw new Error("Contract artifact not found. Please run 'yarn compile' first.");
      }

      const contractJson = JSON.parse(fs.readFileSync(contractPath, "utf8"));
      const wasm = contractJson.source.wasm;
      const metadata = JSON.stringify(contractJson);

      const code = new ContractPromise(api, metadata, "");
      
      const gasLimit = api.registry.createType("WeightV2", {
        refTime: 100_000_000_000n,
        proofSize: 1_000_000n,
      });

      const { gasRequired, result, output } = await code.query.new(
        deployer.address,
        { gasLimit: -1 },
        42
      );

      console.log("[Contract Deploy] Gas required:", gasRequired.toHuman());
      console.log("[Contract Deploy] Result:", result.toHuman());

      const tx = code.tx.new(
        { gasLimit: gasRequired },
        42
      );

      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(deployer, ({ contract: deployedContract, status }) => {
          if (status.isInBlock) {
            console.log("[Contract Deploy] Deployed in block:", status.asInBlock.toHex());
            if (deployedContract) {
              contract = deployedContract;
              resolve();
            }
          } else if (status.isFinalized) {
            console.log("[Contract Deploy] Finalized:", status.asFinalized.toHex());
          } else if (status.isError) {
            reject(new Error("Deployment failed"));
          }
        });
      });

      expect(contract).toBeDefined();
      expect(contract.address).toBeTruthy();
    });
  });

  describe("Contract Interactions", () => {
    it("should get initial counter value", async () => {
      const { output, result } = await contract.query.get(alice.address, {
        gasLimit: -1,
      });

      expect(result.isOk).toBe(true);
      expect(output?.toHuman()).toBe("42");
    });

    it("should increment counter", async () => {
      const gasLimit = api.registry.createType("WeightV2", {
        refTime: 50_000_000_000n,
        proofSize: 500_000n,
      });

      await new Promise<void>((resolve, reject) => {
        contract.tx
          .increment({ gasLimit })
          .signAndSend(alice, ({ status, events }) => {
            if (status.isInBlock) {
              console.log("[Increment] Transaction in block:", status.asInBlock.toHex());
              
              const incrementedEvent = events.find(({ event }) => 
                event.section === "contracts" && event.method === "ContractEmitted"
              );
              
              if (incrementedEvent) {
                console.log("[Increment] Event emitted");
              }
              
              resolve();
            } else if (status.isError) {
              reject(new Error("Increment failed"));
            }
          });
      });

      const { output } = await contract.query.get(alice.address, { gasLimit: -1 });
      expect(output?.toHuman()).toBe("43");
    });

    it("should decrement counter", async () => {
      const gasLimit = api.registry.createType("WeightV2", {
        refTime: 50_000_000_000n,
        proofSize: 500_000n,
      });

      await new Promise<void>((resolve, reject) => {
        contract.tx
          .decrement({ gasLimit })
          .signAndSend(bob, ({ status }) => {
            if (status.isInBlock) {
              console.log("[Decrement] Transaction in block:", status.asInBlock.toHex());
              resolve();
            } else if (status.isError) {
              reject(new Error("Decrement failed"));
            }
          });
      });

      const { output } = await contract.query.get(alice.address, { gasLimit: -1 });
      expect(output?.toHuman()).toBe("42");
    });

    it("should fail to decrement below zero", async () => {
      const currentValue = 42;
      
      for (let i = 0; i < currentValue; i++) {
        await new Promise<void>((resolve) => {
          contract.tx
            .decrement({ gasLimit: -1 })
            .signAndSend(alice, ({ status }) => {
              if (status.isInBlock) resolve();
            });
        });
      }

      const { output: zeroValue } = await contract.query.get(alice.address, { gasLimit: -1 });
      expect(zeroValue?.toHuman()).toBe("0");

      const { result, output } = await contract.query.decrement(alice.address, { gasLimit: -1 });
      expect(result.isErr).toBe(true);
    });

    it("should get contract owner", async () => {
      const { output, result } = await contract.query.getOwner(alice.address, {
        gasLimit: -1,
      });

      expect(result.isOk).toBe(true);
      expect(output?.toString()).toBe(deployer.address);
    });
  });
});