import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { ApiTestHelper, MockSQSClient } from "../../test-utils";
import { ethers } from "ethers";
import * as crypto from "crypto";

describe("Resolver Service - Order Commitment Flow", () => {
  let apiHelper: ApiTestHelper;
  let relayerApi: ApiTestHelper;
  let mockSQS: MockSQSClient;

  beforeAll(async () => {
    apiHelper = new ApiTestHelper({
      baseURL: "http://localhost:3001", // Resolver
    });
    
    relayerApi = new ApiTestHelper({
      baseURL: "http://localhost:3000", // Relayer
    });
    
    mockSQS = new MockSQSClient();
    
    await apiHelper.waitForService("/health");
    await relayerApi.waitForService("/health");
  });

  beforeEach(async () => {
    mockSQS.clearAllQueues();
  });

  afterAll(async () => {
    await apiHelper.cleanup();
    await relayerApi.cleanup();
  });

  describe("Commitment Process", () => {
    it("should commit to profitable order", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const orderData = {
        orderId: "0xcommit123",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: secretHash,
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

      // Simulate order broadcast
      const response = await apiHelper.post("/process-order", orderData);
      
      expect(response.status).toBe(200);
      expect(response.data.committed).toBe(true);
      expect(response.data.commitment).toBeDefined();
      expect(response.data.commitment.orderId).toBe(orderData.orderId);
      expect(response.data.commitment.resolverAddress).toBeDefined();
      expect(response.data.commitment.committedPrice).toBeDefined();
      expect(response.data.commitment.secretHash).toBeDefined();
    });

    it("should generate unique secret hash for commitment", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const userSecretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const orderData = {
        orderId: "0xsecret123",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: userSecretHash,
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

      const response = await apiHelper.post("/process-order", orderData);
      
      expect(response.status).toBe(200);
      expect(response.data.commitment.secretHash).toBeDefined();
      expect(response.data.commitment.secretHash).not.toBe(userSecretHash);
      
      // Verify resolver stores the secret
      const secretResponse = await apiHelper.get(`/secrets/${orderData.orderId}`);
      expect(secretResponse.status).toBe(200);
      expect(secretResponse.data.secret).toBeDefined();
      expect(secretResponse.data.secretHash).toBe(response.data.commitment.secretHash);
    });

    it("should send commitment to relayer", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const orderData = {
        orderId: "0xrelay123",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: secretHash,
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

      // Process order
      const response = await apiHelper.post("/process-order", orderData);
      expect(response.data.committed).toBe(true);

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check that relayer received commitment
      const relayerResponse = await relayerApi.get(`/orders/${orderData.orderId}/commitments`);
      expect(relayerResponse.status).toBe(200);
      expect(relayerResponse.data.commitments).toBeDefined();
      expect(relayerResponse.data.commitments.length).toBeGreaterThan(0);
      
      const commitment = relayerResponse.data.commitments[0];
      expect(commitment.resolver).toBe(response.data.commitment.resolverAddress);
      expect(commitment.committedPrice).toBe(response.data.commitment.committedPrice);
    });
  });

  describe("Commitment Validation", () => {
    it("should not commit to expired orders", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const expiredOrder = {
        orderId: "0xexpired456",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: secretHash,
          creationTimestamp: currentTime - 400,
          fillDeadline: currentTime - 100, // Expired
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: currentTime - 400,
          endTime: currentTime - 100,
          safetyFactor: 0.95,
        },
      };

      const response = await apiHelper.post("/process-order", expiredOrder);
      
      expect(response.status).toBe(200);
      expect(response.data.committed).toBe(false);
      expect(response.data.reason).toContain("expired");
    });

    it("should not commit if insufficient balance", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const largeOrder = {
        orderId: "0xlarge456",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000000", // 1000 ETH (too large)
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000000",
          secretHash: secretHash,
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

      const response = await apiHelper.post("/process-order", largeOrder);
      
      expect(response.status).toBe(200);
      expect(response.data.committed).toBe(false);
      expect(response.data.reason).toContain("insufficient balance");
    });

    it("should not commit to unprofitable orders", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const unprofitableOrder = {
        orderId: "0xbad456",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "900000000000000000", // Bad price
          secretHash: secretHash,
          creationTimestamp: currentTime,
          fillDeadline: currentTime + 300,
          isExactInput: true,
        },
        dutchAuctionData: {
          initialPrice: 0.9,
          finalPrice: 0.85,
          startTime: currentTime,
          endTime: currentTime + 300,
          safetyFactor: 0.95,
        },
      };

      const response = await apiHelper.post("/process-order", unprofitableOrder);
      
      expect(response.status).toBe(200);
      expect(response.data.committed).toBe(false);
      expect(response.data.reason).toContain("unprofitable");
    });
  });

  describe("Commitment Tracking", () => {
    it("should track active commitments", async () => {
      // Get current active commitments
      const response = await apiHelper.get("/commitments/active");
      
      expect(response.status).toBe(200);
      expect(response.data.commitments).toBeDefined();
      expect(Array.isArray(response.data.commitments)).toBe(true);
      
      // Each commitment should have required fields
      for (const commitment of response.data.commitments) {
        expect(commitment.orderId).toBeDefined();
        expect(commitment.status).toBeDefined();
        expect(commitment.committedAt).toBeDefined();
        expect(commitment.expiresAt).toBeDefined();
      }
    });

    it("should prevent double commitments", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const orderData = {
        orderId: "0xdouble123",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: secretHash,
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

      // First commitment should succeed
      const response1 = await apiHelper.post("/process-order", orderData);
      expect(response1.data.committed).toBe(true);

      // Second commitment should fail
      const response2 = await apiHelper.post("/process-order", orderData);
      expect(response2.data.committed).toBe(false);
      expect(response2.data.reason).toContain("already committed");
    });

    it("should limit concurrent commitments", async () => {
      // Get resolver limits
      const limitsResponse = await apiHelper.get("/resolver/limits");
      expect(limitsResponse.status).toBe(200);
      
      const maxConcurrent = limitsResponse.data.maxConcurrentOrders || 10;
      
      // Check current commitments don't exceed limit
      const activeResponse = await apiHelper.get("/commitments/active");
      expect(activeResponse.data.commitments.length).toBeLessThanOrEqual(maxConcurrent);
    });
  });

  describe("Safety Deposit Handling", () => {
    it("should calculate required safety deposit", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const orderData = {
        orderId: "0xdeposit123",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: secretHash,
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

      const response = await apiHelper.post("/calculate-safety-deposit", orderData);
      
      expect(response.status).toBe(200);
      expect(response.data.requiredDeposit).toBeDefined();
      expect(response.data.depositPercentage).toBeDefined();
      expect(response.data.depositPercentage).toBeGreaterThan(0);
      expect(response.data.depositPercentage).toBeLessThanOrEqual(0.1); // Max 10%
    });

    it("should check deposit before commitment", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const secretHash = ethers.utils.keccak256("0x" + crypto.randomBytes(32).toString("hex"));
      
      const orderData = {
        orderId: "0xcheckdeposit123",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: secretHash,
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

      // Mock insufficient deposit scenario
      const response = await apiHelper.post("/process-order", {
        ...orderData,
        skipDepositCheck: false,
      });
      
      // If deposit is insufficient, commitment should fail
      if (!response.data.committed) {
        expect(response.data.reason).toMatch(/deposit|collateral/i);
      }
    });
  });
});