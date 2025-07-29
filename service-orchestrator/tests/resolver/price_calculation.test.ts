import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { ApiTestHelper } from "../../test-utils";
import { ethers } from "ethers";

describe("Resolver Service - Price Calculation Verification", () => {
  let apiHelper: ApiTestHelper;

  beforeAll(async () => {
    apiHelper = new ApiTestHelper({
      baseURL: "http://localhost:3001",
    });
    
    await apiHelper.waitForService("/health");
  });

  afterAll(async () => {
    await apiHelper.cleanup();
  });

  describe("Dutch Auction Price Calculation", () => {
    it("should calculate current price correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xtest123",
        order: {
          srcAmount: "1000000000000000000", // 1 ETH
          outputAmount: "2000000000000000000", // 2 tokens
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 0.95,
        },
      };

      const response = await apiHelper.post("/calculate-order-price", {
        orderData,
        timestamp: currentTime + 150, // Halfway
      });

      expect(response.status).toBe(200);
      expect(response.data.currentPrice).toBeCloseTo(1.95, 6);
      expect(response.data.effectivePrice).toBeCloseTo(1.95 * 0.95, 6);
    });

    it("should apply safety factor correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xtest456",
        order: {
          srcAmount: "1000000000000000000",
          outputAmount: "2000000000000000000",
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.8,
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 0.9, // 10% safety margin
        },
      };

      const response = await apiHelper.post("/calculate-order-price", {
        orderData,
        timestamp: currentTime,
      });

      expect(response.status).toBe(200);
      expect(response.data.currentPrice).toBe(2.0);
      expect(response.data.effectivePrice).toBe(1.8); // 2.0 * 0.9
      expect(response.data.resolverReceives).toBe("1800000000000000000"); // 1.8 tokens
    });

    it("should handle exact output orders", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xtest789",
        order: {
          srcAmount: "1000000000000000000",
          outputAmount: "2000000000000000000", // User wants exactly 2 tokens
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: false, // Exact output
        },
        dutchAuctionData: {
          initialPrice: 0.5, // 1/2.0 - input per output
          finalPrice: 0.555, // 1/1.8
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 1.05, // 5% extra input required
        },
      };

      const response = await apiHelper.post("/calculate-order-price", {
        orderData,
        timestamp: currentTime,
      });

      expect(response.status).toBe(200);
      expect(response.data.currentPrice).toBe(0.5);
      expect(response.data.effectivePrice).toBeCloseTo(0.525, 6); // 0.5 * 1.05
      expect(response.data.resolverPays).toBe("1050000000000000000"); // 1.05 ETH
    });
  });

  describe("Profitability Analysis", () => {
    it("should calculate profit margin correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xprofit123",
        order: {
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 0.95,
        },
      };

      const marketPrices = {
        srcTokenPrice: 2000, // $2000 per ETH
        dstTokenPrice: 1, // $1 per token
      };

      const response = await apiHelper.post("/analyze-profitability", {
        orderData,
        timestamp: currentTime,
        marketPrices,
        gasCosts: {
          srcChainGas: "50000000000000000", // 0.05 ETH
          dstChainGas: "10000000000000", // 0.00001 ETH
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.isProfitable).toBeDefined();
      expect(response.data.expectedProfit).toBeDefined();
      expect(response.data.profitMargin).toBeDefined();
      expect(response.data.breakdown).toBeDefined();
    });

    it("should reject unprofitable orders", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xunprofit123",
        order: {
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "1000000000000000000", // Only 1 token (bad price)
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 1.0, // Bad initial price
          finalPrice: 0.9,
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 0.95,
        },
      };

      const marketPrices = {
        srcTokenPrice: 2000,
        dstTokenPrice: 1,
      };

      const response = await apiHelper.post("/analyze-profitability", {
        orderData,
        timestamp: currentTime,
        marketPrices,
        gasCosts: {
          srcChainGas: "50000000000000000",
          dstChainGas: "10000000000000",
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.isProfitable).toBe(false);
      expect(response.data.expectedProfit).toBeLessThan(0);
    });

    it("should include slippage in calculations", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xslippage123",
        order: {
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "10000000000000000000", // 10 ETH (large order)
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "20000000000000000000", // 20 tokens
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 0.95,
        },
      };

      const response = await apiHelper.post("/analyze-profitability", {
        orderData,
        timestamp: currentTime,
        marketPrices: {
          srcTokenPrice: 2000,
          dstTokenPrice: 1,
        },
        slippageFactors: {
          srcChain: 0.01, // 1% slippage on source
          dstChain: 0.02, // 2% slippage on destination
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.adjustedProfitWithSlippage).toBeDefined();
      expect(response.data.adjustedProfitWithSlippage).toBeLessThan(response.data.expectedProfit);
    });
  });

  describe("Time-based Price Updates", () => {
    it("should track price changes over time", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xtime123",
        order: {
          srcAmount: "1000000000000000000",
          outputAmount: "2000000000000000000",
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 2.2,
          finalPrice: 1.8,
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 0.95,
        },
      };

      // Get prices at different times
      const priceHistory = [];
      for (let t = 0; t <= 300; t += 60) {
        const response = await apiHelper.post("/calculate-order-price", {
          orderData,
          timestamp: currentTime + t,
        });
        
        priceHistory.push({
          time: t,
          price: response.data.currentPrice,
          effectivePrice: response.data.effectivePrice,
        });
      }

      // Verify prices decrease over time
      for (let i = 1; i < priceHistory.length; i++) {
        expect(priceHistory[i].price).toBeLessThan(priceHistory[i - 1].price);
        expect(priceHistory[i].effectivePrice).toBeLessThan(priceHistory[i - 1].effectivePrice);
      }

      // Verify initial and final prices
      expect(priceHistory[0].price).toBe(2.2);
      expect(priceHistory[priceHistory.length - 1].price).toBeCloseTo(1.8, 6);
    });

    it("should handle near-expiry orders", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const orderData = {
        orderId: "0xexpiry123",
        order: {
          srcAmount: "1000000000000000000",
          outputAmount: "2000000000000000000",
          creationTimestamp: currentTime - 290,
          fillDeadline: currentTime + 10, // Only 10 seconds left
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: currentTime - 290,
          endTime: currentTime + 10,
          safetyFactor: 0.95,
        },
      };

      const response = await apiHelper.post("/should-commit-to-order", {
        orderData,
        timestamp: currentTime,
        minTimeBuffer: 30, // Require 30 seconds minimum
      });

      expect(response.status).toBe(200);
      expect(response.data.shouldCommit).toBe(false);
      expect(response.data.reason).toContain("insufficient time");
    });
  });
});