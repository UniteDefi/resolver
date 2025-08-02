import { describe, it, expect, beforeAll } from "@jest/globals";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import {
  setupTestEnvironment,
  TestEnvironment,
  generateTestWallet,
  mintMockUsdc,
  createOrderHash,
  createSecretAndHash,
} from "./setup";

describe("Cross-Chain Swap Tests", () => {
  let env: TestEnvironment;
  let maker: Ed25519Keypair;
  let taker: Ed25519Keypair;
  let resolver: Ed25519Keypair;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    maker = generateTestWallet();
    taker = generateTestWallet();
    resolver = generateTestWallet();

    // Fund test wallets with mock USDC
    await mintMockUsdc(env, maker.getPublicKey().toSuiAddress(), 1000000000); // 1000 USDC
    await mintMockUsdc(env, taker.getPublicKey().toSuiAddress(), 1000000000);
  });

  describe("End-to-end cross-chain swap", () => {
    it("should complete a cross-chain swap successfully", async () => {
      const makerAddress = maker.getPublicKey().toSuiAddress();
      const takerAddress = taker.getPublicKey().toSuiAddress();
      const resolverAddress = resolver.getPublicKey().toSuiAddress();

      // Step 1: Resolver registers
      console.log("[Test] Registering resolver...");
      const registerTx = new TransactionBlock();
      const [coin] = registerTx.splitCoins(registerTx.gas, [registerTx.pure(1000000000)]); // 1 SUI deposit
      
      registerTx.moveCall({
        target: `${env.contracts.resolver}::resolver::register_resolver`,
        arguments: [
          registerTx.object(env.contracts.resolver),
          coin,
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: resolver,
        transactionBlock: registerTx,
      });

      // Step 2: Create limit order
      console.log("[Test] Creating limit order...");
      const orderHash = createOrderHash(
        makerAddress,
        env.contracts.mockUsdc,
        env.contracts.mockUsdc,
        BigInt(100000000), // 100 USDC
        BigInt(95000000),  // 95 USDC (simulating cross-chain fee)
        BigInt(Date.now()),
      );

      const createOrderTx = new TransactionBlock();
      createOrderTx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::create_order`,
        arguments: [
          createOrderTx.object(env.contracts.limitOrderProtocol),
          createOrderTx.pure(Buffer.from(orderHash, "hex")),
          createOrderTx.pure(makerAddress),
          createOrderTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createOrderTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createOrderTx.pure(100000000),
          createOrderTx.pure(95000000),
          createOrderTx.pure(takerAddress),
          createOrderTx.pure(null), // No specific allowed sender
          createOrderTx.pure(Date.now() + 3600000), // 1 hour expiry
          createOrderTx.pure(Date.now()),
          createOrderTx.pure(1), // Source chain ID
          createOrderTx.pure(2), // Destination chain ID
          createOrderTx.object("0x6"), // Clock object
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: createOrderTx,
      });

      // Step 3: Deploy escrow on source chain
      console.log("[Test] Deploying escrow...");
      const { secret, hash } = createSecretAndHash();
      
      const deployEscrowTx = new TransactionBlock();
      deployEscrowTx.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          deployEscrowTx.object(env.contracts.escrowFactory),
          deployEscrowTx.pure(Buffer.from(orderHash, "hex")),
          deployEscrowTx.pure(makerAddress),
          deployEscrowTx.pure(Buffer.from(env.contracts.mockUsdc)),
          deployEscrowTx.pure(100000000),
          deployEscrowTx.pure(takerAddress),
          deployEscrowTx.pure(Buffer.from(env.contracts.mockUsdc)),
          deployEscrowTx.pure(2), // Destination chain ID
          deployEscrowTx.pure(Buffer.from(hash, "hex")),
          deployEscrowTx.pure(Date.now() + 3600000), // 1 hour timelock
          deployEscrowTx.object("0x6"), // Clock object
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: maker,
        transactionBlock: deployEscrowTx,
      });

      // Step 4: Resolver submits settlement proof
      console.log("[Test] Submitting settlement proof...");
      const settlementTx = new TransactionBlock();
      settlementTx.moveCall({
        target: `${env.contracts.resolver}::resolver::submit_settlement`,
        arguments: [
          settlementTx.object(env.contracts.resolver),
          settlementTx.pure(Buffer.from(orderHash, "hex")),
          settlementTx.pure(1), // Source chain ID
          settlementTx.pure(2), // Destination chain ID
          settlementTx.pure(Buffer.from("0x123...", "hex")), // Mock source tx hash
          settlementTx.pure(Buffer.from("0x456...", "hex")), // Mock dest tx hash
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: resolver,
        transactionBlock: settlementTx,
      });

      console.log("[Test] Cross-chain swap completed successfully!");
    });
  });

  describe("Edge cases", () => {
    it("should handle order expiration", async () => {
      // Test expired order rejection
      const expiredOrderHash = createOrderHash(
        maker.getPublicKey().toSuiAddress(),
        env.contracts.mockUsdc,
        env.contracts.mockUsdc,
        BigInt(50000000),
        BigInt(45000000),
        BigInt(Date.now()),
      );

      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${env.contracts.limitOrderProtocol}::limit_order_protocol::create_order`,
        arguments: [
          tx.object(env.contracts.limitOrderProtocol),
          tx.pure(Buffer.from(expiredOrderHash, "hex")),
          tx.pure(maker.getPublicKey().toSuiAddress()),
          tx.pure(Buffer.from(env.contracts.mockUsdc)),
          tx.pure(Buffer.from(env.contracts.mockUsdc)),
          tx.pure(50000000),
          tx.pure(45000000),
          tx.pure(taker.getPublicKey().toSuiAddress()),
          tx.pure(null),
          tx.pure(Date.now() - 1000), // Already expired
          tx.pure(Date.now()),
          tx.pure(1),
          tx.pure(2),
          tx.object("0x6"),
        ],
      });

      await expect(
        env.client.signAndExecuteTransactionBlock({
          signer: maker,
          transactionBlock: tx,
        })
      ).rejects.toThrow();
    });

    it("should handle unauthorized resolver", async () => {
      const unauthorizedResolver = generateTestWallet();
      
      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${env.contracts.resolver}::resolver::submit_settlement`,
        arguments: [
          tx.object(env.contracts.resolver),
          tx.pure(Buffer.from("fake_order_hash", "hex")),
          tx.pure(1),
          tx.pure(2),
          tx.pure(Buffer.from("0x000", "hex")),
          tx.pure(Buffer.from("0x000", "hex")),
        ],
      });

      await expect(
        env.client.signAndExecuteTransactionBlock({
          signer: unauthorizedResolver,
          transactionBlock: tx,
        })
      ).rejects.toThrow();
    });
  });
});