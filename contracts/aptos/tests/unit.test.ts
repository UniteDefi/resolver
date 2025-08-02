import { describe, it, expect, beforeAll } from "vitest";
import { AptosClient, AptosAccount, FaucetClient } from "aptos";
import * as dotenv from "dotenv";

dotenv.config();

const NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com";
const FAUCET_URL = process.env.APTOS_FAUCET_URL || "https://faucet.testnet.aptoslabs.com";

describe("Unite Aptos Unit Tests", () => {
  let client: AptosClient;
  let faucetClient: FaucetClient;
  let deployer: AptosAccount;
  let user1: AptosAccount;
  let user2: AptosAccount;
  let moduleAddress: string;

  beforeAll(async () => {
    client = new AptosClient(NODE_URL);
    faucetClient = new FaucetClient(NODE_URL, FAUCET_URL);

    // Create test accounts
    deployer = new AptosAccount();
    user1 = new AptosAccount();
    user2 = new AptosAccount();

    console.log("[Test] Funding test accounts...");
    await faucetClient.fundAccount(deployer.address(), 100_000_000);
    await faucetClient.fundAccount(user1.address(), 100_000_000);
    await faucetClient.fundAccount(user2.address(), 100_000_000);

    moduleAddress = deployer.address().hex();
    console.log("[Test] Module address:", moduleAddress);
  });

  describe("Escrow Module", () => {
    it("should initialize escrow events", async () => {
      const payload = {
        function: `${moduleAddress}::escrow::initialize`,
        type_arguments: [],
        arguments: [],
      };

      const txn = await client.generateTransaction(deployer.address(), payload);
      const signedTxn = await client.signTransaction(deployer, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Check events resource was created
      const resources = await client.getAccountResources(moduleAddress);
      const eventsResource = resources.find(
        r => r.type === `${moduleAddress}::escrow::EscrowEvents`
      );

      expect(eventsResource).toBeDefined();
    });

    it("should create an escrow", async () => {
      const amount = 1000000; // 1 APT
      const hashlock = "0x" + "a".repeat(64); // 32 bytes
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const escrowId = "0x" + "b".repeat(64); // 32 bytes

      const payload = {
        function: `${moduleAddress}::escrow::create_escrow`,
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [
          user2.address().hex(),
          amount.toString(),
          Array.from(Buffer.from(hashlock.slice(2), "hex")),
          timelock.toString(),
          Array.from(Buffer.from(escrowId.slice(2), "hex")),
        ],
      };

      const txn = await client.generateTransaction(user1.address(), payload);
      const signedTxn = await client.signTransaction(user1, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Verify escrow was created
      const escrowDetails = await client.view({
        function: `${moduleAddress}::escrow::get_escrow_details`,
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [user1.address().hex()],
      });

      expect(escrowDetails[0]).toBe(user1.address().hex()); // src_address
      expect(escrowDetails[1]).toBe(user2.address().hex()); // dst_address
      expect(escrowDetails[2]).toBe(amount.toString()); // amount
      expect(escrowDetails[4]).toBe(timelock.toString()); // timelock
      expect(escrowDetails[5]).toBe("0"); // state (active)
    });
  });

  describe("Resolver Module", () => {
    it("should initialize resolver registry", async () => {
      const payload = {
        function: `${moduleAddress}::resolver::initialize`,
        type_arguments: [],
        arguments: [],
      };

      const txn = await client.generateTransaction(deployer.address(), payload);
      const signedTxn = await client.signTransaction(deployer, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Check registry was created
      const resources = await client.getAccountResources(moduleAddress);
      const registryResource = resources.find(
        r => r.type === `${moduleAddress}::resolver::ResolverRegistry`
      );

      expect(registryResource).toBeDefined();
    });

    it("should register a resolver", async () => {
      const resolverName = Array.from(Buffer.from("TestResolver", "utf8"));
      const feeBps = 100; // 1%

      const payload = {
        function: `${moduleAddress}::resolver::register_resolver`,
        type_arguments: [],
        arguments: [resolverName, feeBps.toString()],
      };

      const txn = await client.generateTransaction(user1.address(), payload);
      const signedTxn = await client.signTransaction(user1, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Check resolver count
      const count = await client.view({
        function: `${moduleAddress}::resolver::get_resolver_count`,
        type_arguments: [],
        arguments: [],
      });

      expect(Number(count[0])).toBeGreaterThan(0);

      // Check resolver info
      const info = await client.view({
        function: `${moduleAddress}::resolver::get_resolver_info`,
        type_arguments: [],
        arguments: [user1.address().hex()],
      });

      expect(info[1]).toBe(feeBps.toString()); // fee_bps
      expect(info[2]).toBe(true); // is_active
    });
  });

  describe("Limit Order Protocol", () => {
    it("should initialize order book", async () => {
      const payload = {
        function: `${moduleAddress}::limit_order_protocol::initialize`,
        type_arguments: [],
        arguments: [],
      };

      const txn = await client.generateTransaction(deployer.address(), payload);
      const signedTxn = await client.signTransaction(deployer, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Check order book was created
      const resources = await client.getAccountResources(moduleAddress);
      const orderBookResource = resources.find(
        r => r.type === `${moduleAddress}::limit_order_protocol::OrderBook`
      );

      expect(orderBookResource).toBeDefined();
    });

    it("should create an order", async () => {
      const makerAsset = "0x1::aptos_coin::AptosCoin";
      const takerAsset = `${moduleAddress}::test_coin::USDT`;
      const makerAmount = 1000000; // 1 APT
      const takerAmount = 1000000; // 1 USDT
      const salt = Date.now();
      const expiry = Math.floor(Date.now() / 1000) + 86400; // 24 hours

      const payload = {
        function: `${moduleAddress}::limit_order_protocol::create_order`,
        type_arguments: [],
        arguments: [
          user2.address().hex(), // taker
          makerAsset,
          takerAsset,
          makerAmount.toString(),
          takerAmount.toString(),
          salt.toString(),
          expiry.toString(),
        ],
      };

      const txn = await client.generateTransaction(user1.address(), payload);
      const signedTxn = await client.signTransaction(user1, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Check order count
      const count = await client.view({
        function: `${moduleAddress}::limit_order_protocol::get_order_count`,
        type_arguments: [],
        arguments: [],
      });

      expect(Number(count[0])).toBeGreaterThan(0);
    });
  });

  describe("Test Coins", () => {
    it("should initialize test USDT", async () => {
      const payload = {
        function: `${moduleAddress}::test_coin::initialize_usdt`,
        type_arguments: [],
        arguments: [],
      };

      const txn = await client.generateTransaction(deployer.address(), payload);
      const signedTxn = await client.signTransaction(deployer, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Check USDT was initialized
      const resources = await client.getAccountResources(deployer.address());
      const usdtStore = resources.find(
        r => r.type === `0x1::coin::CoinStore<${moduleAddress}::test_coin::USDT>`
      );

      expect(usdtStore).toBeDefined();
      expect(Number(usdtStore?.data.coin.value)).toBeGreaterThan(0);
    });

    it("should initialize test DAI", async () => {
      const payload = {
        function: `${moduleAddress}::test_coin::initialize_dai`,
        type_arguments: [],
        arguments: [],
      };

      const txn = await client.generateTransaction(deployer.address(), payload);
      const signedTxn = await client.signTransaction(deployer, txn);
      const res = await client.submitTransaction(signedTxn);
      await client.waitForTransaction(res.hash);

      // Check DAI was initialized
      const resources = await client.getAccountResources(deployer.address());
      const daiStore = resources.find(
        r => r.type === `0x1::coin::CoinStore<${moduleAddress}::test_coin::DAI>`
      );

      expect(daiStore).toBeDefined();
      expect(Number(daiStore?.data.coin.value)).toBeGreaterThan(0);
    });
  });
});