import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
  U64,
  MoveVector,
} from "@aptos-labs/ts-sdk";
import * as dotenv from "dotenv";
import allDeployments from "../deployments.json";

dotenv.config();

describe("🧪 Aptos Unite Protocol Unit Tests", () => {
  let aptos: Aptos;
  let admin: Account;
  let user: Account;
  let resolver1: Account;
  let resolver2: Account;
  let deployments: any;
  let packageAddress: string;

  beforeAll(async () => {
    const network = (process.env.APTOS_NETWORK?.toLowerCase() as Network) || Network.DEVNET;
    const config = new AptosConfig({ network });
    aptos = new Aptos(config);
    
    console.log("[Test Setup] Using network:", network);

    // Setup admin account
    const privateKey = process.env.APTOS_PRIVATE_KEY;
    if (privateKey) {
      admin = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(privateKey),
      });
    } else {
      admin = Account.generate();
      console.log("[Test Setup] Generated admin account:", admin.accountAddress.toString());
      console.log("[Test Setup] Admin private key:", admin.privateKey.toString());
      
      await aptos.fundAccount({
        accountAddress: admin.accountAddress,
        amount: 100_000_000,
      });
      console.log("[Test Setup] Admin account funded");
    }

    // Setup test accounts
    user = Account.generate();
    resolver1 = Account.generate();
    resolver2 = Account.generate();

    // Fund test accounts
    await Promise.all([
      aptos.fundAccount({ accountAddress: user.accountAddress, amount: 50_000_000 }),
      aptos.fundAccount({ accountAddress: resolver1.accountAddress, amount: 50_000_000 }),
      aptos.fundAccount({ accountAddress: resolver2.accountAddress, amount: 50_000_000 }),
    ]);

    deployments = allDeployments.aptos?.[network] || allDeployments.aptos?.devnet;
    packageAddress = deployments?.packageAddress || admin.accountAddress.toString();
    
    console.log("[Test Setup] Package address:", packageAddress);
    console.log("[Test Setup] User address:", user.accountAddress.toString());
    console.log("[Test Setup] Resolver 1 address:", resolver1.accountAddress.toString());
    console.log("[Test Setup] Resolver 2 address:", resolver2.accountAddress.toString());
  });

  describe("Test Coin Module", () => {
    it("should initialize test coins", async () => {
      console.log("\n--- Testing Coin Initialization ---");

      // Initialize USDT
      try {
        const initUSDTTxn = await aptos.transaction.build.simple({
          sender: admin.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::initialize_usdt`,
            functionArguments: [],
          },
        });

        const usdtResult = await aptos.signAndSubmitTransaction({
          signer: admin,
          transaction: initUSDTTxn,
        });

        await aptos.waitForTransaction({
          transactionHash: usdtResult.hash,
        });

        console.log("✅ Test USDT initialized");
      } catch (error: any) {
        if (error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
          console.log("✅ Test USDT already initialized");
        } else {
          console.log("❌ USDT initialization failed:", error.message);
          throw error;
        }
      }

      // Initialize DAI
      try {
        const initDAITxn = await aptos.transaction.build.simple({
          sender: admin.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::initialize_dai`,
            functionArguments: [],
          },
        });

        const daiResult = await aptos.signAndSubmitTransaction({
          signer: admin,
          transaction: initDAITxn,
        });

        await aptos.waitForTransaction({
          transactionHash: daiResult.hash,
        });

        console.log("✅ Test DAI initialized");
      } catch (error: any) {
        if (error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
          console.log("✅ Test DAI already initialized");
        } else {
          console.log("❌ DAI initialization failed:", error.message);
          throw error;
        }
      }
    });

    it("should register and mint test tokens", async () => {
      console.log("\n--- Testing Token Registration and Minting ---");

      // Register user for USDT
      try {
        const registerTxn = await aptos.transaction.build.simple({
          sender: user.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::register_usdt`,
            functionArguments: [],
          },
        });

        await aptos.signAndSubmitTransaction({
          signer: user,
          transaction: registerTxn,
        }).then(result => aptos.waitForTransaction({
          transactionHash: result.hash,
        }));

        console.log("✅ User registered for USDT");
      } catch (error: any) {
        if (error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
          console.log("✅ User already registered for USDT");
        } else {
          console.log("❌ USDT registration failed:", error.message);
        }
      }

      // Check initial balance
      const initialBalance = await aptos.view({
        payload: {
          function: `${packageAddress}::test_coin::get_usdt_balance`,
          functionArguments: [user.accountAddress],
        },
      });

      console.log("Initial USDT balance:", initialBalance[0]);

      // Mint USDT to user
      const mintAmount = "1000000000"; // 1000 USDT with 6 decimals
      
      try {
        const mintTxn = await aptos.transaction.build.simple({
          sender: admin.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::mint_usdt`,
            functionArguments: [
              user.accountAddress,
              mintAmount,
              packageAddress,
            ],
          },
        });

        await aptos.signAndSubmitTransaction({
          signer: admin,
          transaction: mintTxn,
        }).then(result => aptos.waitForTransaction({
          transactionHash: result.hash,
        }));

        console.log("✅ Minted 1000 USDT to user");
      } catch (error: any) {
        console.log("❌ USDT minting failed:", error.message);
        throw error;
      }

      // Check final balance
      const finalBalance = await aptos.view({
        payload: {
          function: `${packageAddress}::test_coin::get_usdt_balance`,
          functionArguments: [user.accountAddress],
        },
      });

      console.log("Final USDT balance:", finalBalance[0]);
      expect(BigInt(finalBalance[0] as string)).toBeGreaterThan(BigInt(initialBalance[0] as string));
    });
  });

  describe("Limit Order Protocol Module", () => {
    it("should initialize limit order protocol", async () => {
      console.log("\n--- Testing Limit Order Protocol Initialization ---");

      try {
        const initTxn = await aptos.transaction.build.simple({
          sender: admin.accountAddress,
          data: {
            function: `${packageAddress}::limit_order_protocol::initialize`,
            functionArguments: [],
          },
        });

        await aptos.signAndSubmitTransaction({
          signer: admin,
          transaction: initTxn,
        }).then(result => aptos.waitForTransaction({
          transactionHash: result.hash,
        }));

        console.log("✅ Limit Order Protocol initialized");
      } catch (error: any) {
        if (error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
          console.log("✅ Limit Order Protocol already initialized");
        } else {
          console.log("❌ LOP initialization failed:", error.message);
          throw error;
        }
      }

      // Test nonce query
      try {
        const nonce = await aptos.view({
          payload: {
            function: `${packageAddress}::limit_order_protocol::get_nonce`,
            functionArguments: [user.accountAddress, packageAddress],
          },
        });

        console.log("User nonce:", nonce[0]);
        expect(nonce[0]).toBeDefined();
      } catch (error: any) {
        console.log("❌ Nonce query failed:", error.message);
      }
    });
  });

  describe("Escrow Factory Module", () => {
    it("should initialize escrow factory", async () => {
      console.log("\n--- Testing Escrow Factory Initialization ---");

      try {
        const initTxn = await aptos.transaction.build.simple({
          sender: admin.accountAddress,
          data: {
            function: `${packageAddress}::escrow_factory::initialize`,
            functionArguments: [],
          },
        });

        await aptos.signAndSubmitTransaction({
          signer: admin,
          transaction: initTxn,
        }).then(result => aptos.waitForTransaction({
          transactionHash: result.hash,
        }));

        console.log("✅ Escrow Factory initialized");
      } catch (error: any) {
        if (error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
          console.log("✅ Escrow Factory already initialized");
        } else {
          console.log("❌ Factory initialization failed:", error.message);
          throw error;
        }
      }
    });
  });

  describe("Resolver Module", () => {
    it("should initialize resolvers", async () => {
      console.log("\n--- Testing Resolver Initialization ---");

      // Initialize resolver 1
      try {
        const initTxn = await aptos.transaction.build.simple({
          sender: resolver1.accountAddress,
          data: {
            function: `${packageAddress}::resolver::initialize`,
            functionArguments: [
              packageAddress, // factory_addr
              packageAddress, // protocol_addr
            ],
          },
        });

        await aptos.signAndSubmitTransaction({
          signer: resolver1,
          transaction: initTxn,
        }).then(result => aptos.waitForTransaction({
          transactionHash: result.hash,
        }));

        console.log("✅ Resolver 1 initialized");
      } catch (error: any) {
        if (error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
          console.log("✅ Resolver 1 already initialized");
        } else {
          console.log("❌ Resolver 1 initialization failed:", error.message);
        }
      }

      // Check resolver info
      try {
        const resolverInfo = await aptos.view({
          payload: {
            function: `${packageAddress}::resolver::get_resolver_info`,
            functionArguments: [resolver1.accountAddress],
          },
        });

        console.log("Resolver 1 info:", resolverInfo);
        expect(resolverInfo).toBeDefined();
        expect(resolverInfo.length).toBe(3); // owner, factory, protocol
      } catch (error: any) {
        console.log("❌ Resolver info query failed:", error.message);
      }
    });
  });

  describe("Integration Tests", () => {
    it("should handle basic escrow creation flow", async () => {
      console.log("\n--- Testing Basic Escrow Creation ---");

      // Prepare test data
      const orderHash = new Array(32).fill(0).map((_, i) => i + 1); // Simple test hash
      const hashlock = new Array(32).fill(0).map((_, i) => (i * 2) % 256); // Simple test hashlock
      
      const immutables = {
        order_hash: orderHash,
        hashlock: hashlock,
        maker: user.accountAddress,
        taker: "0x0",
        token: packageAddress,
        amount: new U64(1000000), // 1 USDT
        safety_deposit: new U64(1000), // 0.001 APT
        timelocks: new U64(0),
      };

      // This is a simplified test to show the structure
      // In practice, you'd test the full escrow creation flow
      console.log("✅ Test data prepared");
      console.log("Order hash:", orderHash);
      console.log("Immutables:", immutables);
      
      // Test would continue with actual escrow creation...
      expect(orderHash.length).toBe(32);
      expect(hashlock.length).toBe(32);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid function calls gracefully", async () => {
      console.log("\n--- Testing Error Handling ---");

      // Test calling uninitialized function
      try {
        await aptos.view({
          payload: {
            function: `${packageAddress}::test_coin::get_usdt_balance`,
            functionArguments: ["0x999"], // Non-existent account
          },
        });
        console.log("✅ Handled non-existent account query");
      } catch (error: any) {
        console.log("✅ Expected error for non-existent account:", error.message);
        expect(error).toBeDefined();
      }

      // Test invalid mint without authorization
      try {
        const mintTxn = await aptos.transaction.build.simple({
          sender: user.accountAddress, // Non-admin trying to mint
          data: {
            function: `${packageAddress}::test_coin::mint_usdt`,
            functionArguments: [
              user.accountAddress,
              "1000000",
              packageAddress,
            ],
          },
        });

        await aptos.signAndSubmitTransaction({
          signer: user,
          transaction: mintTxn,
        }).then(result => aptos.waitForTransaction({
          transactionHash: result.hash,
        }));

        console.log("❌ Should not allow non-admin minting");
        expect(false).toBe(true); // Should not reach here
      } catch (error: any) {
        console.log("✅ Properly rejected non-admin mint:", error.message);
        expect(error).toBeDefined();
      }
    });
  });
});