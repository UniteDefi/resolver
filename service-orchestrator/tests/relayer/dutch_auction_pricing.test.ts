import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { ApiTestHelper } from "../../test-utils";

describe("Relayer Service - Dutch Auction Pricing", () => {
  let apiHelper: ApiTestHelper;

  beforeAll(async () => {
    apiHelper = new ApiTestHelper({
      baseURL: "http://localhost:3000",
    });
    
    await apiHelper.waitForService("/health");
  });

  afterAll(async () => {
    await apiHelper.cleanup();
  });

  describe("Price Calculation", () => {
    it("should calculate initial price correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime,
        fillDeadline: currentTime + 300, // 5 minutes
        initialPrice: 2.0,
        finalPrice: 1.9,
        inputAmount: "1000000000000000000", // 1 ETH
        outputAmount: "2000000000000000000", // 2 tokens
        isExactInput: true,
      };

      // At t=0, price should be initialPrice
      const response = await apiHelper.post("/calculate-price", {
        order,
        timestamp: currentTime,
      });

      expect(response.status).toBe(200);
      expect(response.data.currentPrice).toBeCloseTo(2.0, 6);
      expect(response.data.effectiveOutputAmount).toBe("2000000000000000000");
    });

    it("should calculate final price correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime,
        fillDeadline: currentTime + 300, // 5 minutes
        initialPrice: 2.0,
        finalPrice: 1.9,
        inputAmount: "1000000000000000000",
        outputAmount: "2000000000000000000",
        isExactInput: true,
      };

      // At t=fillDeadline, price should be finalPrice
      const response = await apiHelper.post("/calculate-price", {
        order,
        timestamp: currentTime + 300,
      });

      expect(response.status).toBe(200);
      expect(response.data.currentPrice).toBeCloseTo(1.9, 6);
      expect(response.data.effectiveOutputAmount).toBe("1900000000000000000");
    });

    it("should calculate intermediate price correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime,
        fillDeadline: currentTime + 300, // 5 minutes
        initialPrice: 2.0,
        finalPrice: 1.8,
        inputAmount: "1000000000000000000",
        outputAmount: "2000000000000000000",
        isExactInput: true,
      };

      // At t=150 (halfway), price should be midpoint
      const response = await apiHelper.post("/calculate-price", {
        order,
        timestamp: currentTime + 150,
      });

      expect(response.status).toBe(200);
      expect(response.data.currentPrice).toBeCloseTo(1.9, 6);
      expect(response.data.effectiveOutputAmount).toBe("1900000000000000000");
    });

    it("should handle exact output orders correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime,
        fillDeadline: currentTime + 300,
        initialPrice: 0.5, // 1/2.0
        finalPrice: 0.526, // 1/1.9
        inputAmount: "1000000000000000000",
        outputAmount: "2000000000000000000",
        isExactInput: false, // Exact output
      };

      // For exact output, input amount varies
      const response = await apiHelper.post("/calculate-price", {
        order,
        timestamp: currentTime,
      });

      expect(response.status).toBe(200);
      expect(response.data.currentPrice).toBeCloseTo(0.5, 6);
      expect(response.data.effectiveInputAmount).toBe("1000000000000000000");
    });
  });

  describe("Price Validation", () => {
    it("should reject orders with invalid price range", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime,
        fillDeadline: currentTime + 300,
        initialPrice: 1.5, // Final price is better than initial (invalid for buyer)
        finalPrice: 2.0,
        inputAmount: "1000000000000000000",
        outputAmount: "2000000000000000000",
        isExactInput: true,
      };

      try {
        await apiHelper.post("/validate-order", { order });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain("Invalid price range");
      }
    });

    it("should enforce safety factor correctly", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime,
        fillDeadline: currentTime + 300,
        initialPrice: 2.0,
        finalPrice: 1.9,
        safetyFactor: 0.95,
        inputAmount: "1000000000000000000",
        outputAmount: "2000000000000000000",
        isExactInput: true,
      };

      const response = await apiHelper.post("/calculate-effective-price", {
        order,
        timestamp: currentTime,
      });

      expect(response.status).toBe(200);
      // Effective price should be currentPrice * safetyFactor
      expect(response.data.effectivePrice).toBeCloseTo(2.0 * 0.95, 6);
    });
  });

  describe("Time-based Price Updates", () => {
    it("should update price linearly over time", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime,
        fillDeadline: currentTime + 300,
        initialPrice: 2.0,
        finalPrice: 1.5,
        inputAmount: "1000000000000000000",
        outputAmount: "2000000000000000000",
        isExactInput: true,
      };

      // Get prices at different timestamps
      const prices = [];
      for (let t = 0; t <= 300; t += 60) {
        const response = await apiHelper.post("/calculate-price", {
          order,
          timestamp: currentTime + t,
        });
        prices.push({
          time: t,
          price: response.data.currentPrice,
        });
      }

      // Verify prices decrease linearly
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i].price).toBeLessThan(prices[i - 1].price);
      }

      // Verify linear interpolation
      const expectedDecreasePerMinute = (2.0 - 1.5) / 5;
      for (let i = 1; i < prices.length; i++) {
        const actualDecrease = prices[i - 1].price - prices[i].price;
        expect(actualDecrease).toBeCloseTo(expectedDecreasePerMinute, 5);
      }
    });

    it("should handle expired orders", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const order = {
        creationTimestamp: currentTime - 400,
        fillDeadline: currentTime - 100, // Expired 100 seconds ago
        initialPrice: 2.0,
        finalPrice: 1.9,
        inputAmount: "1000000000000000000",
        outputAmount: "2000000000000000000",
        isExactInput: true,
      };

      try {
        await apiHelper.post("/calculate-price", {
          order,
          timestamp: currentTime,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain("Order expired");
      }
    });
  });
});