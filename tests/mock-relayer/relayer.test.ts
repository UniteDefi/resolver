import { describe, it, beforeAll, afterAll, expect } from "@jest/globals";
import { MockRelayerService, RelayerConfig } from "./relayer.service";
import { parseUnits } from "ethers";
import { Network } from "@aptos-labs/ts-sdk";

jest.setTimeout(30000);

describe("Mock Relayer Service", () => {
  let relayer: MockRelayerService;
  
  const config: RelayerConfig = {
    ethereum: {
      rpc: "http://localhost:8545",
      chainId: 1,
      escrowFactory: "0x1234567890123456789012345678901234567890",
      resolver: "0x2345678901234567890123456789012345678901",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    },
    aptos: {
      network: Network.DEVNET,
      escrowFactory: "0x1::escrow_factory",
      resolver: "0x1::resolver",
      privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  };
  
  beforeAll(async () => {
    relayer = new MockRelayerService(config);
    await relayer.start();
  });
  
  afterAll(async () => {
    await relayer.stop();
  });
  
  describe("Order Creation and Filling", () => {
    it("should create and auto-fill an order", async () => {
      const orderCreatedPromise = new Promise((resolve) => {
        relayer.once("orderCreated", resolve);
      });
      
      const orderFilledPromise = new Promise((resolve) => {
        relayer.once("orderFilled", resolve);
      });
      
      const escrowCreatedPromise = new Promise((resolve) => {
        relayer.once("escrowCreated", resolve);
      });
      
      const orderId = await relayer.createEthereumOrder({
        srcChainId: 1,
        dstChainId: 99999, // Aptos chain ID
        maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        taker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        srcToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
        dstToken: "0x1::usdc::USDC", // USDC on Aptos
        srcAmount: parseUnits("100", 6),
        dstAmount: parseUnits("99", 6),
        srcTimelock: Math.floor(Date.now() / 1000) + 7200,
        dstTimelock: Math.floor(Date.now() / 1000) + 3600
      });
      
      const orderCreatedEvent = await orderCreatedPromise;
      const orderFilledEvent = await orderFilledPromise;
      const escrowCreatedEvent = await escrowCreatedPromise;
      
      expect(orderId).toBeTruthy();
      expect(orderCreatedEvent).toBeTruthy();
      expect(orderFilledEvent).toBeTruthy();
      expect(escrowCreatedEvent).toBeTruthy();
      
      const order = relayer.getOrder(orderId);
      expect(order).toBeTruthy();
      expect(order?.srcAmount).toBe(parseUnits("100", 6));
      expect(order?.dstAmount).toBe(parseUnits("99", 6));
    });
  });
  
  describe("Secret Reveal and Withdrawal", () => {
    it("should handle secret reveal and complete withdrawal", async () => {
      const withdrawalPromise = new Promise((resolve) => {
        relayer.once("withdrawalCompleted", resolve);
      });
      
      const orderId = await relayer.createEthereumOrder({
        srcChainId: 1,
        dstChainId: 99999,
        maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        taker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        srcToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        dstToken: "0x1::usdc::USDC",
        srcAmount: parseUnits("100", 6),
        dstAmount: parseUnits("99", 6),
        srcTimelock: Math.floor(Date.now() / 1000) + 7200,
        dstTimelock: Math.floor(Date.now() / 1000) + 3600
      });
      
      const secret = relayer.getSecret(orderId);
      expect(secret).toBeTruthy();
      
      // Simulate user withdrawing on Aptos with secret
      await relayer.onAptosWithdrawal(orderId, secret!);
      
      const withdrawalEvent = await withdrawalPromise;
      expect(withdrawalEvent).toBeTruthy();
    });
  });
  
  describe("Timeout Scenarios", () => {
    it("should handle timeout and cancellation", async () => {
      const cancelPromises = Promise.all([
        new Promise((resolve) => {
          relayer.once("escrowCancelled", (event) => {
            if (event.chain === "aptos") resolve(event);
          });
        }),
        new Promise((resolve) => {
          relayer.once("escrowCancelled", (event) => {
            if (event.chain === "ethereum") resolve(event);
          });
        })
      ]);
      
      const orderId = await relayer.createEthereumOrder({
        srcChainId: 1,
        dstChainId: 99999,
        maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        taker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        srcToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        dstToken: "0x1::usdc::USDC",
        srcAmount: parseUnits("50", 6),
        dstAmount: parseUnits("49.5", 6),
        srcTimelock: Math.floor(Date.now() / 1000) + 60,
        dstTimelock: Math.floor(Date.now() / 1000) + 30
      });
      
      // Simulate timeout
      await relayer.simulateTimeout(orderId);
      
      const [aptosCancelEvent, ethCancelEvent] = await cancelPromises;
      expect(aptosCancelEvent).toBeTruthy();
      expect(ethCancelEvent).toBeTruthy();
    });
  });
  
  describe("Relayer Statistics", () => {
    it("should track relayer statistics", async () => {
      // Create multiple orders
      await relayer.createEthereumOrder({
        srcChainId: 1,
        dstChainId: 99999,
        maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        taker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        srcToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        dstToken: "0x1::usdc::USDC",
        srcAmount: parseUnits("200", 6),
        dstAmount: parseUnits("198", 6),
        srcTimelock: Math.floor(Date.now() / 1000) + 7200,
        dstTimelock: Math.floor(Date.now() / 1000) + 3600
      });
      
      await relayer.createEthereumOrder({
        srcChainId: 1,
        dstChainId: 99999,
        maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        taker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        srcToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        dstToken: "0x1::usdc::USDC",
        srcAmount: parseUnits("150", 6),
        dstAmount: parseUnits("148.5", 6),
        srcTimelock: Math.floor(Date.now() / 1000) + 7200,
        dstTimelock: Math.floor(Date.now() / 1000) + 3600
      });
      
      const stats = relayer.getStats();
      expect(stats.totalOrders).toBeGreaterThanOrEqual(2);
      expect(stats.activeOrders).toBeGreaterThanOrEqual(0);
      console.log("[Relayer] Stats:", stats);
    });
  });
});