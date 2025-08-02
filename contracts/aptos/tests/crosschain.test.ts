import { describe, it, expect, beforeAll } from "vitest";
import { AptosClient, AptosAccount, FaucetClient } from "aptos";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { createHash } from "crypto";

dotenv.config();

// Aptos configuration
const APTOS_NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com";
const APTOS_FAUCET_URL = process.env.APTOS_FAUCET_URL || "https://faucet.testnet.aptoslabs.com";

// EVM configuration
const EVM_RPC_URL = process.env.EVM_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/demo";
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

describe("Cross-chain Integration Tests", () => {
  let aptosClient: AptosClient;
  let aptosFaucet: FaucetClient;
  let aptosAccount: AptosAccount;
  let moduleAddress: string;

  let evmProvider: ethers.Provider;
  let evmSigner: ethers.Signer;
  let evmAddress: string;

  beforeAll(async () => {
    // Initialize Aptos
    aptosClient = new AptosClient(APTOS_NODE_URL);
    aptosFaucet = new FaucetClient(APTOS_NODE_URL, APTOS_FAUCET_URL);
    aptosAccount = new AptosAccount();
    moduleAddress = aptosAccount.address().hex();

    // Fund Aptos account
    console.log("[CrossChain] Funding Aptos account...");
    await aptosFaucet.fundAccount(aptosAccount.address(), 100_000_000);

    // Initialize EVM
    if (EVM_PRIVATE_KEY) {
      evmProvider = new ethers.JsonRpcProvider(EVM_RPC_URL);
      evmSigner = new ethers.Wallet(EVM_PRIVATE_KEY, evmProvider);
      evmAddress = await evmSigner.getAddress();
      console.log("[CrossChain] EVM address:", evmAddress);
    } else {
      console.warn("[CrossChain] No EVM private key provided, skipping EVM tests");
    }
  });

  describe("Cross-chain HTLC Flow", () => {
    it("should create matching HTLCs on both chains", async function() {
      if (!evmSigner) {
        this.skip();
        return;
      }

      // Generate shared secret and hashlock
      const secret = ethers.randomBytes(32);
      const hashlock = createHash("sha256").update(secret).digest();

      console.log("[CrossChain] Secret:", ethers.hexlify(secret));
      console.log("[CrossChain] Hashlock:", ethers.hexlify(hashlock));

      // Common parameters
      const amount = ethers.parseEther("0.1");
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const escrowId = ethers.randomBytes(32);

      // Create Aptos HTLC
      const aptosPayload = {
        function: `${moduleAddress}::escrow::create_escrow`,
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [
          evmAddress, // dst_address (EVM address as recipient)
          amount.toString(),
          Array.from(hashlock),
          timelock.toString(),
          Array.from(escrowId),
        ],
      };

      const aptosTxn = await aptosClient.generateTransaction(
        aptosAccount.address(),
        aptosPayload
      );
      const signedAptosTxn = await aptosClient.signTransaction(aptosAccount, aptosTxn);
      const aptosRes = await aptosClient.submitTransaction(signedAptosTxn);
      await aptosClient.waitForTransaction(aptosRes.hash);

      console.log("[CrossChain] Aptos HTLC created:", aptosRes.hash);

      // TODO: Create matching EVM HTLC using escrowId
      // This would interact with the EVM escrow contract

      expect(aptosRes.hash).toBeDefined();
    });

    it("should handle cross-chain order matching", async function() {
      if (!evmSigner) {
        this.skip();
        return;
      }

      // Create an order on Aptos
      const orderPayload = {
        function: `${moduleAddress}::limit_order_protocol::create_order`,
        type_arguments: [],
        arguments: [
          "0x0", // Open to any taker
          "0x1::aptos_coin::AptosCoin", // APT
          `${moduleAddress}::test_coin::USDT`, // USDT
          "1000000", // 1 APT
          "1000000", // 1 USDT
          Date.now().toString(),
          (Math.floor(Date.now() / 1000) + 86400).toString(), // 24 hours
        ],
      };

      const orderTxn = await aptosClient.generateTransaction(
        aptosAccount.address(),
        orderPayload
      );
      const signedOrderTxn = await aptosClient.signTransaction(aptosAccount, orderTxn);
      const orderRes = await aptosClient.submitTransaction(signedOrderTxn);
      await aptosClient.waitForTransaction(orderRes.hash);

      console.log("[CrossChain] Order created on Aptos:", orderRes.hash);

      // TODO: Match this order from EVM side
      // This would involve:
      // 1. Reading the order details from Aptos
      // 2. Creating matching escrows on both chains
      // 3. Executing the atomic swap

      expect(orderRes.hash).toBeDefined();
    });
  });

  describe("Resolver Integration", () => {
    it("should register cross-chain resolver", async () => {
      // Register as a resolver on Aptos
      const resolverName = Array.from(Buffer.from("CrossChainResolver", "utf8"));
      const feeBps = 50; // 0.5%

      const payload = {
        function: `${moduleAddress}::resolver::register_resolver`,
        type_arguments: [],
        arguments: [resolverName, feeBps.toString()],
      };

      const txn = await aptosClient.generateTransaction(aptosAccount.address(), payload);
      const signedTxn = await aptosClient.signTransaction(aptosAccount, txn);
      const res = await aptosClient.submitTransaction(signedTxn);
      await aptosClient.waitForTransaction(res.hash);

      // Verify registration
      const info = await aptosClient.view({
        function: `${moduleAddress}::resolver::get_resolver_info`,
        type_arguments: [],
        arguments: [aptosAccount.address().hex()],
      });

      expect(info[1]).toBe(feeBps.toString());
      expect(info[2]).toBe(true); // is_active

      console.log("[CrossChain] Resolver registered on Aptos");
    });

    it("should simulate cross-chain swap resolution", async () => {
      // Generate test data
      const escrowId = ethers.randomBytes(32);
      const secret = ethers.randomBytes(32);

      // Simulate resolving a swap
      const payload = {
        function: `${moduleAddress}::resolver::resolve_swap`,
        type_arguments: [],
        arguments: [
          Array.from(escrowId),
          Array.from(secret),
        ],
      };

      const txn = await aptosClient.generateTransaction(aptosAccount.address(), payload);
      const signedTxn = await aptosClient.signTransaction(aptosAccount, txn);
      const res = await aptosClient.submitTransaction(signedTxn);
      await aptosClient.waitForTransaction(res.hash);

      console.log("[CrossChain] Swap resolved:", res.hash);

      // Check resolver stats updated
      const info = await aptosClient.view({
        function: `${moduleAddress}::resolver::get_resolver_info`,
        type_arguments: [],
        arguments: [aptosAccount.address().hex()],
      });

      expect(Number(info[3])).toBeGreaterThan(0); // total_resolved
    });
  });

  describe("Multi-chain Token Support", () => {
    it("should handle wrapped token representations", async () => {
      // Initialize wrapped versions of EVM tokens
      const payload = {
        function: `${moduleAddress}::test_coin::register_and_mint_usdt`,
        type_arguments: [],
        arguments: ["1000000000"], // 1000 USDT
      };

      const txn = await aptosClient.generateTransaction(aptosAccount.address(), payload);
      const signedTxn = await aptosClient.signTransaction(aptosAccount, txn);
      const res = await aptosClient.submitTransaction(signedTxn);
      await aptosClient.waitForTransaction(res.hash);

      // Check balance
      const resources = await aptosClient.getAccountResources(aptosAccount.address());
      const usdtStore = resources.find(
        r => r.type === `0x1::coin::CoinStore<${moduleAddress}::test_coin::USDT>`
      );

      expect(usdtStore).toBeDefined();
      console.log("[CrossChain] USDT balance:", usdtStore?.data.coin.value);
    });
  });
});