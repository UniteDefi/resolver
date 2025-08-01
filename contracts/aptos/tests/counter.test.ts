import { describe, it, expect, beforeAll } from "vitest";
import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

describe("Counter Contract", () => {
  let aptos: Aptos;
  let account: Account;
  let moduleAddress: string;

  beforeAll(async () => {
    const networkFromEnv = process.env.APTOS_NETWORK?.toLowerCase();
    const network = networkFromEnv === "testnet" ? Network.TESTNET : 
                   networkFromEnv === "mainnet" ? Network.MAINNET : 
                   Network.DEVNET;
    
    const config = new AptosConfig({
      network: network,
    });
    aptos = new Aptos(config);
    
    console.log("[Test Setup] Using network:", network);

    // Create or load account
    const privateKey = process.env.APTOS_PRIVATE_KEY;
    if (privateKey) {
      account = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(privateKey),
      });
    } else {
      account = Account.generate();
      console.log("[Test Setup] Generated new account:", account.accountAddress.toString());
      console.log("[Test Setup] Private key:", account.privateKey.toString());
      
      // Fund the account on devnet
      await aptos.fundAccount({
        accountAddress: account.accountAddress,
        amount: 100_000_000, // 1 APT
      });
      console.log("[Test Setup] Account funded");
    }

    moduleAddress = account.accountAddress.toString();
    console.log("[Test Setup] Module address:", moduleAddress);

    // Module is already deployed, skip deployment in tests
    console.log("[Test Setup] Using already deployed module");
  });

  it("should initialize counter", async () => {
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${moduleAddress}::counter::initialize`,
        functionArguments: [],
      },
    });

    const pendingTxn = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    const result = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    expect(result.success).toBe(true);
    console.log("[Test/Initialize] Transaction successful");
  });

  it("should get initial counter value", async () => {
    const value = await aptos.view({
      payload: {
        function: `${moduleAddress}::counter::get_value`,
        functionArguments: [account.accountAddress],
      },
    });

    expect(value[0]).toBe("0");
    console.log("[Test/GetValue] Initial value:", value[0]);
  });

  it("should increment counter", async () => {
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${moduleAddress}::counter::increment`,
        functionArguments: [],
      },
    });

    const pendingTxn = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    const value = await aptos.view({
      payload: {
        function: `${moduleAddress}::counter::get_value`,
        functionArguments: [account.accountAddress],
      },
    });

    expect(value[0]).toBe("1");
    console.log("[Test/Increment] Value after increment:", value[0]);
  });

  it("should decrement counter", async () => {
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${moduleAddress}::counter::decrement`,
        functionArguments: [],
      },
    });

    const pendingTxn = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    const value = await aptos.view({
      payload: {
        function: `${moduleAddress}::counter::get_value`,
        functionArguments: [account.accountAddress],
      },
    });

    expect(value[0]).toBe("0");
    console.log("[Test/Decrement] Value after decrement:", value[0]);
  });
});