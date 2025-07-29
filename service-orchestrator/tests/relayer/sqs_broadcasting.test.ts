import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { MockSQSClient, DatabaseTestHelper, ApiTestHelper } from "../../test-utils";
import * as crypto from "crypto";
import { ethers } from "ethers";

describe("Relayer Service - SQS Message Broadcasting", () => {
  let mockSQS: MockSQSClient;
  let dbHelper: DatabaseTestHelper;
  let apiHelper: ApiTestHelper;
  let testDb: any;

  beforeAll(async () => {
    mockSQS = new MockSQSClient();
    dbHelper = new DatabaseTestHelper();
    apiHelper = new ApiTestHelper({
      baseURL: "http://localhost:3000",
    });
    
    await apiHelper.waitForService("/health");
  });

  beforeEach(async () => {
    mockSQS.clearAllQueues();
    testDb = dbHelper.createTestDatabase("sqs-broadcasting");
    dbHelper.initializeRelayerSchema(testDb);
  });

  afterAll(async () => {
    await dbHelper.cleanup();
    await apiHelper.cleanup();
  });

  describe("Order Broadcasting", () => {
    it("should broadcast new order to SQS queue", async () => {
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      // Set up listener for SQS messages
      const messagePromise = new Promise((resolve) => {
        mockSQS.once("messageSent", resolve);
      });

      // Create order
      const response = await apiHelper.post("/create-swap", {
        swapRequest,
        signature: "0xmocksignature",
        secret,
      });

      expect(response.status).toBe(200);
      const orderId = response.data.orderId;

      // Wait for SQS message
      const messageEvent: any = await messagePromise;
      
      expect(messageEvent.queueUrl).toBe(process.env.SQS_QUEUE_URL || "https://sqs.us-east-1.amazonaws.com/123456789/orders");
      
      const messageBody = JSON.parse(messageEvent.message.Body);
      expect(messageBody.orderId).toBe(orderId);
      expect(messageBody.type).toBe("NEW_ORDER");
      expect(messageBody.order).toBeDefined();
      expect(messageBody.order.srcChainId).toBe(1);
      expect(messageBody.order.dstChainId).toBe(137);
    });

    it("should include correct message attributes", async () => {
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      const messagePromise = new Promise((resolve) => {
        mockSQS.once("messageSent", resolve);
      });

      await apiHelper.post("/create-swap", {
        swapRequest,
        signature: "0xmocksignature",
        secret,
      });

      const messageEvent: any = await messagePromise;
      const attributes = messageEvent.message.MessageAttributes;
      
      expect(attributes).toBeDefined();
      expect(attributes.srcChainId).toEqual({
        DataType: "Number",
        StringValue: "1",
      });
      expect(attributes.dstChainId).toEqual({
        DataType: "Number", 
        StringValue: "137",
      });
      expect(attributes.orderType).toEqual({
        DataType: "String",
        StringValue: "DUTCH_AUCTION",
      });
    });

    it("should broadcast to multiple resolver queues", async () => {
      // Configure multiple resolver queues
      const resolverQueues = [
        "https://sqs.us-east-1.amazonaws.com/123456789/resolver-1",
        "https://sqs.us-east-1.amazonaws.com/123456789/resolver-2",
        "https://sqs.us-east-1.amazonaws.com/123456789/resolver-3",
      ];

      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      const messages: any[] = [];
      mockSQS.on("messageSent", (event) => messages.push(event));

      await apiHelper.post("/create-swap", {
        swapRequest,
        signature: "0xmocksignature",
        secret,
      });

      // Wait a bit for all messages
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should broadcast to all resolver queues
      expect(messages.length).toBeGreaterThanOrEqual(resolverQueues.length);
      
      const queueUrls = messages.map(m => m.queueUrl);
      for (const queue of resolverQueues) {
        expect(queueUrls).toContain(queue);
      }
    });
  });

  describe("Message Content", () => {
    it("should include Dutch auction parameters in message", async () => {
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      const messagePromise = new Promise((resolve) => {
        mockSQS.once("messageSent", resolve);
      });

      const response = await apiHelper.post("/create-swap", {
        swapRequest,
        signature: "0xmocksignature",
        secret,
      });

      const messageEvent: any = await messagePromise;
      const messageBody = JSON.parse(messageEvent.message.Body);
      
      expect(messageBody.dutchAuctionData).toBeDefined();
      expect(messageBody.dutchAuctionData.initialPrice).toBeDefined();
      expect(messageBody.dutchAuctionData.finalPrice).toBeDefined();
      expect(messageBody.dutchAuctionData.startTime).toBeDefined();
      expect(messageBody.dutchAuctionData.endTime).toBeDefined();
      expect(messageBody.dutchAuctionData.safetyFactor).toBeDefined();
    });

    it("should NOT include secret in broadcast message", async () => {
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      const messagePromise = new Promise((resolve) => {
        mockSQS.once("messageSent", resolve);
      });

      await apiHelper.post("/create-swap", {
        swapRequest,
        signature: "0xmocksignature",
        secret,
      });

      const messageEvent: any = await messagePromise;
      const messageBody = JSON.parse(messageEvent.message.Body);
      
      // Secret should NEVER be in the broadcast
      expect(messageBody.secret).toBeUndefined();
      expect(messageBody.order.secret).toBeUndefined();
      
      // Only secretHash should be included
      expect(messageBody.order.secretHash).toBe(secretHash);
    });
  });

  describe("Error Handling", () => {
    it("should handle SQS send failures gracefully", async () => {
      // Mock SQS to fail
      mockSQS.send = async () => {
        throw new Error("SQS service unavailable");
      };

      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      // Order creation should still succeed even if SQS fails
      const response = await apiHelper.post("/create-swap", {
        swapRequest,
        signature: "0xmocksignature",
        secret,
      });

      expect(response.status).toBe(200);
      expect(response.data.orderId).toBeDefined();
      
      // Order should be stored in database
      const orders = dbHelper.getAllOrders(testDb);
      expect(orders.length).toBe(1);
    });

    it("should retry failed SQS messages", async () => {
      let attemptCount = 0;
      const originalSend = mockSQS.send.bind(mockSQS);
      
      // Mock to fail first 2 attempts
      mockSQS.send = async (command: any) => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error("Temporary SQS failure");
        }
        return originalSend(command);
      };

      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      const messagePromise = new Promise((resolve) => {
        mockSQS.once("messageSent", resolve);
      });

      await apiHelper.post("/create-swap", {
        swapRequest,
        signature: "0xmocksignature",
        secret,
      });

      // Should eventually succeed after retries
      await messagePromise;
      expect(attemptCount).toBeGreaterThan(2);
    });
  });
});