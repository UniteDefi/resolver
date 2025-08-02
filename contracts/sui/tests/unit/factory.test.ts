import { describe, it, expect, beforeAll } from "@jest/globals";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import {
  setupTestEnvironment,
  TestEnvironment,
  generateTestWallet,
  createSecretAndHash,
} from "../setup";

describe("Escrow Factory Tests", () => {
  let env: TestEnvironment;
  let owner: Ed25519Keypair;
  let user: Ed25519Keypair;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    owner = env.keypair; // Deployer is owner
    user = generateTestWallet();
  });

  describe("Factory management", () => {
    it("should track deployed escrows", async () => {
      const orderId1 = Buffer.from("factory_test_001", "utf8");
      const orderId2 = Buffer.from("factory_test_002", "utf8");
      const { hash } = createSecretAndHash();
      
      // Deploy first escrow
      const tx1 = new TransactionBlock();
      tx1.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          tx1.object(env.contracts.escrowFactory),
          tx1.pure(orderId1),
          tx1.pure(user.getPublicKey().toSuiAddress()),
          tx1.pure(Buffer.from(env.contracts.mockUsdc)),
          tx1.pure(100000000),
          tx1.pure(user.getPublicKey().toSuiAddress()),
          tx1.pure(Buffer.from(env.contracts.mockUsdc)),
          tx1.pure(2),
          tx1.pure(Buffer.from(hash, "hex")),
          tx1.pure(Date.now() + 3600000),
          tx1.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: user,
        transactionBlock: tx1,
      });

      // Deploy second escrow
      const tx2 = new TransactionBlock();
      tx2.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          tx2.object(env.contracts.escrowFactory),
          tx2.pure(orderId2),
          tx2.pure(user.getPublicKey().toSuiAddress()),
          tx2.pure(Buffer.from(env.contracts.mockUsdc)),
          tx2.pure(200000000),
          tx2.pure(user.getPublicKey().toSuiAddress()),
          tx2.pure(Buffer.from(env.contracts.mockUsdc)),
          tx2.pure(2),
          tx2.pure(Buffer.from(hash, "hex")),
          tx2.pure(Date.now() + 3600000),
          tx2.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: user,
        transactionBlock: tx2,
      });

      // TODO: Query factory state to verify escrow count
    });

    it("should prevent duplicate order IDs", async () => {
      const duplicateOrderId = Buffer.from("duplicate_001", "utf8");
      const { hash } = createSecretAndHash();
      
      // First deployment should succeed
      const tx1 = new TransactionBlock();
      tx1.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          tx1.object(env.contracts.escrowFactory),
          tx1.pure(duplicateOrderId),
          tx1.pure(user.getPublicKey().toSuiAddress()),
          tx1.pure(Buffer.from(env.contracts.mockUsdc)),
          tx1.pure(100000000),
          tx1.pure(user.getPublicKey().toSuiAddress()),
          tx1.pure(Buffer.from(env.contracts.mockUsdc)),
          tx1.pure(2),
          tx1.pure(Buffer.from(hash, "hex")),
          tx1.pure(Date.now() + 3600000),
          tx1.object("0x6"),
        ],
      });

      await env.client.signAndExecuteTransactionBlock({
        signer: user,
        transactionBlock: tx1,
      });

      // Second deployment with same ID should fail
      const tx2 = new TransactionBlock();
      tx2.moveCall({
        target: `${env.contracts.escrowFactory}::escrow_factory::deploy_escrow`,
        typeArguments: [`${env.contracts.mockUsdc}::mock_usdc::MOCK_USDC`],
        arguments: [
          tx2.object(env.contracts.escrowFactory),
          tx2.pure(duplicateOrderId),
          tx2.pure(user.getPublicKey().toSuiAddress()),
          tx2.pure(Buffer.from(env.contracts.mockUsdc)),
          tx2.pure(100000000),
          tx2.pure(user.getPublicKey().toSuiAddress()),
          tx2.pure(Buffer.from(env.contracts.mockUsdc)),
          tx2.pure(2),
          tx2.pure(Buffer.from(hash, "hex")),
          tx2.pure(Date.now() + 3600000),
          tx2.object("0x6"),
        ],
      });

      await expect(
        env.client.signAndExecuteTransactionBlock({
          signer: user,
          transactionBlock: tx2,
        })
      ).rejects.toThrow();
    });
  });

  describe("Access control", () => {
    it("should allow owner to pause factory", async () => {
      // TODO: Implement pause functionality test
      // This requires AdminCap which is held by the owner
    });

    it("should prevent non-owner from pausing", async () => {
      // TODO: Test unauthorized pause attempt
    });
  });
});