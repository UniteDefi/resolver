import { describe, it, expect, beforeAll } from "@jest/globals";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import {
  setupTestEnvironment,
  TestEnvironment,
  generateTestWallet,
  mintMockUsdc,
  createSecretAndHash,
} from "../setup";

describe("Escrow Contract Tests", () => {
  let env: TestEnvironment;
  let alice: Ed25519Keypair;
  let bob: Ed25519Keypair;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    alice = generateTestWallet();
    bob = generateTestWallet();

    // Fund test wallets
    await mintMockUsdc(env, alice.getPublicKey().toSuiAddress(), 1000000000);
    await mintMockUsdc(env, bob.getPublicKey().toSuiAddress(), 1000000000);
  });

  describe("Escrow creation and filling", () => {
    it("should create and fill an escrow", async () => {
      const { secret, hash } = createSecretAndHash();
      const orderId = Buffer.from("test_order_001", "utf8");
      
      // Create escrow
      const createTx = new TransactionBlock();
      createTx.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          createTx.object(env.contracts.escrowFactory),
          createTx.pure(orderId),
          createTx.pure(alice.getPublicKey().toSuiAddress()),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(100000000), // 100 USDC
          createTx.pure(bob.getPublicKey().toSuiAddress()),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(2), // Destination chain
          createTx.pure(Buffer.from(hash, "hex")),
          createTx.pure(Date.now() + 3600000), // 1 hour
          createTx.object("0x6"), // Clock
        ],
      });

      const result = await env.client.signAndExecuteTransactionBlock({
        signer: alice,
        transactionBlock: createTx,
        options: {
          showEvents: true,
        },
      });

      expect(result.events).toBeDefined();
      const escrowCreatedEvent = result.events?.find(
        (e) => e.type.includes("EscrowCreated")
      );
      expect(escrowCreatedEvent).toBeDefined();
    });
  });

  describe("HTLC functionality", () => {
    it("should withdraw with correct secret", async () => {
      const { secret, hash } = createSecretAndHash();
      const orderId = Buffer.from("test_htlc_001", "utf8");
      
      // Create and fill escrow
      const createTx = new TransactionBlock();
      createTx.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          createTx.object(env.contracts.escrowFactory),
          createTx.pure(orderId),
          createTx.pure(alice.getPublicKey().toSuiAddress()),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(50000000), // 50 USDC
          createTx.pure(bob.getPublicKey().toSuiAddress()),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(2),
          createTx.pure(Buffer.from(hash, "hex")),
          createTx.pure(Date.now() + 3600000),
          createTx.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: alice,
        transactionBlock: createTx,
      });

      // TODO: Add withdrawal test once we have escrow address retrieval
    });

    it("should refund after timeout", async () => {
      const { secret, hash } = createSecretAndHash();
      const orderId = Buffer.from("test_refund_001", "utf8");
      
      // Create escrow with short timeout
      const createTx = new TransactionBlock();
      createTx.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          createTx.object(env.contracts.escrowFactory),
          createTx.pure(orderId),
          createTx.pure(alice.getPublicKey().toSuiAddress()),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(25000000), // 25 USDC
          createTx.pure(bob.getPublicKey().toSuiAddress()),
          createTx.pure(Buffer.from(env.contracts.mockUsdc)),
          createTx.pure(2),
          createTx.pure(Buffer.from(hash, "hex")),
          createTx.pure(1000), // Very short timeout for testing
          createTx.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: alice,
        transactionBlock: createTx,
      });

      // TODO: Add refund test after timeout
    });
  });

  describe("Error cases", () => {
    it("should fail with insufficient amount", async () => {
      // Test creating escrow with amount higher than balance
      // Implementation depends on how the contracts handle this
    });

    it("should fail with invalid secret", async () => {
      // Test withdrawal with wrong secret
      // Implementation after escrow address retrieval is added
    });
  });
});