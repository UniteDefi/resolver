import { describe, it, expect, beforeAll } from "@jest/globals";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import {
  setupTestEnvironment,
  TestEnvironment,
  generateTestWallet,
  createOrderHash,
  mintMockUsdc,
} from "../setup";

describe("Limit Order Protocol Tests", () => {
  let env: TestEnvironment;
  let maker: Ed25519Keypair;
  let taker: Ed25519Keypair;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    maker = generateTestWallet();
    taker = generateTestWallet();

    // Fund wallets
    await mintMockUsdc(env, maker.getPublicKey().toSuiAddress(), 1000000000);
    await mintMockUsdc(env, taker.getPublicKey().toSuiAddress(), 1000000000);
  });

  describe("Order lifecycle", () => {
    it("should create a limit order", async () => {
      const makerAddress = maker.getPublicKey().toSuiAddress();
      const takerAddress = taker.getPublicKey().toSuiAddress();
      
      const orderHash = createOrderHash(
        makerAddress,
        env.contracts.mockUsdc,
        env.contracts.mockUsdc,
        BigInt(100000000),
        BigInt(95000000),
        BigInt(Date.now()),
      );

      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::create_order`,
        arguments: [
          tx.object(env.contracts.limitOrderProtocol),
          tx.pure(Buffer.from(orderHash, "hex")),
          tx.pure(makerAddress),
          tx.pure(Buffer.from(env.contracts.mockUsdc)),
          tx.pure(Buffer.from(env.contracts.mockUsdc)),
          tx.pure(100000000),
          tx.pure(95000000),
          tx.pure(makerAddress),
          tx.pure(null), // No specific allowed sender
          tx.pure(Date.now() + 3600000), // 1 hour expiry
          tx.pure(Date.now()),
          tx.pure(1), // Source chain
          tx.pure(2), // Dest chain
          tx.object("0x6"), // Clock
        ],
      });

      const result = await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: tx,
        options: {
          showEvents: true,
        },
      });

      expect(result.events).toBeDefined();
      const orderCreatedEvent = result.events?.find(
        (e) => e.type.includes("OrderCreated")
      );
      expect(orderCreatedEvent).toBeDefined();
    });

    it("should fill an order", async () => {
      const makerAddress = maker.getPublicKey().toSuiAddress();
      const orderHash = createOrderHash(
        makerAddress,
        env.contracts.mockUsdc,
        env.contracts.mockUsdc,
        BigInt(50000000),
        BigInt(45000000),
        BigInt(Date.now() + 1),
      );

      // Create order
      const createTx = new TransactionBlock();
      createTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::create_order`,
        arguments: [
          createTx.object(env.contracts.limitOrderProtocol),
          createTx.pure(Buffer.from(orderHash, "hex")),
          createTx.pure(makerAddress),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(50000000),
          createTx.pure(45000000),
          createTx.pure(makerAddress),
          createTx.pure(null),
          createTx.pure(Date.now() + 3600000),
          createTx.pure(Date.now() + 1),
          createTx.pure(1),
          createTx.pure(2),
          createTx.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: createTx,
      });

      // Fill order
      const fillTx = new TransactionBlock();
      fillTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::fill_order`,
        arguments: [
          fillTx.object(env.contracts.limitOrderProtocol),
          fillTx.pure(Buffer.from(orderHash, "hex")),
          fillTx.pure(50000000), // Full amount
          fillTx.pure(45000000),
          fillTx.object("0x6"),
        ],
      });

      const fillResult = await env.client.signAndExecuteTransactionBlock({
        signer: taker,
        transactionBlock: fillTx,
        options: {
          showEvents: true,
        },
      });

      const orderFilledEvent = fillResult.events?.find(
        (e) => e.type.includes("OrderFilled")
      );
      expect(orderFilledEvent).toBeDefined();
    });

    it("should cancel an order", async () => {
      const makerAddress = maker.getPublicKey().toSuiAddress();
      const orderHash = createOrderHash(
        makerAddress,
        env.contracts.mockUsdc,
        env.contracts.mockUsdc,
        BigInt(25000000),
        BigInt(24000000),
        BigInt(Date.now() + 2),
      );

      // Create order
      const createTx = new TransactionBlock();
      createTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::create_order`,
        arguments: [
          createTx.object(env.contracts.limitOrderProtocol),
          createTx.pure(Buffer.from(orderHash, "hex")),
          createTx.pure(makerAddress),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(25000000),
          createTx.pure(24000000),
          createTx.pure(makerAddress),
          createTx.pure(null),
          createTx.pure(Date.now() + 3600000),
          createTx.pure(Date.now() + 2),
          createTx.pure(1),
          createTx.pure(2),
          createTx.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: createTx,
      });

      // Cancel order
      const cancelTx = new TransactionBlock();
      cancelTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::cancel_order`,
        arguments: [
          cancelTx.object(env.contracts.limitOrderProtocol),
          cancelTx.pure(Buffer.from(orderHash, "hex")),
        ],
      });

      const cancelResult = await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: cancelTx,
        options: {
          showEvents: true,
        },
      });

      const orderCancelledEvent = cancelResult.events?.find(
        (e) => e.type.includes("OrderCancelled")
      );
      expect(orderCancelledEvent).toBeDefined();
    });
  });

  describe("Access control", () => {
    it("should prevent non-maker from cancelling", async () => {
      const makerAddress = maker.getPublicKey().toSuiAddress();
      const orderHash = createOrderHash(
        makerAddress,
        env.contracts.mockUsdc,
        env.contracts.mockUsdc,
        BigInt(10000000),
        BigInt(9500000),
        BigInt(Date.now() + 3),
      );

      // Create order
      const createTx = new TransactionBlock();
      createTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::create_order`,
        arguments: [
          createTx.object(env.contracts.limitOrderProtocol),
          createTx.pure(Buffer.from(orderHash, "hex")),
          createTx.pure(makerAddress),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(10000000),
          createTx.pure(9500000),
          createTx.pure(makerAddress),
          createTx.pure(null),
          createTx.pure(Date.now() + 3600000),
          createTx.pure(Date.now() + 3),
          createTx.pure(1),
          createTx.pure(2),
          createTx.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: createTx,
      });

      // Try to cancel as taker (should fail)
      const cancelTx = new TransactionBlock();
      cancelTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::cancel_order`,
        arguments: [
          cancelTx.object(env.contracts.limitOrderProtocol),
          cancelTx.pure(Buffer.from(orderHash, "hex")),
        ],
      });

      await expect(
        env.client.signAndExecuteTransactionBlock({
          signer: taker,
          transactionBlock: cancelTx,
        })
      ).rejects.toThrow();
    });

    it("should respect allowed sender restriction", async () => {
      const makerAddress = maker.getPublicKey().toSuiAddress();
      const allowedTaker = taker.getPublicKey().toSuiAddress();
      const unauthorizedTaker = generateTestWallet();
      
      const orderHash = createOrderHash(
        makerAddress,
        env.contracts.mockUsdc,
        env.contracts.mockUsdc,
        BigInt(20000000),
        BigInt(19000000),
        BigInt(Date.now() + 4),
      );

      // Create order with specific allowed sender
      const createTx = new TransactionBlock();
      createTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::create_order`,
        arguments: [
          createTx.object(env.contracts.limitOrderProtocol),
          createTx.pure(Buffer.from(orderHash, "hex")),
          createTx.pure(makerAddress),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(20000000),
          createTx.pure(19000000),
          createTx.pure(makerAddress),
          createTx.pure([allowedTaker]), // Specific allowed sender
          createTx.pure(Date.now() + 3600000),
          createTx.pure(Date.now() + 4),
          createTx.pure(1),
          createTx.pure(2),
          createTx.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: createTx,
      });

      // Try to fill as unauthorized taker (should fail)
      const fillTx = new TransactionBlock();
      fillTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::fill_order`,
        arguments: [
          fillTx.object(env.contracts.limitOrderProtocol),
          fillTx.pure(Buffer.from(orderHash, "hex")),
          fillTx.pure(20000000),
          fillTx.pure(19000000),
          fillTx.object("0x6"),
        ],
      });

      await expect(
        env.client.signAndExecuteTransactionBlock({
          signer: unauthorizedTaker,
          transactionBlock: fillTx,
        })
      ).rejects.toThrow();
    });
  });
});