import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { MockSQSClient, ApiTestHelper, SendMessageCommand } from "../../test-utils";

describe("Resolver Service - SQS Message Consumption", () => {
  let mockSQS: MockSQSClient;
  let apiHelper: ApiTestHelper;
  const resolverQueueUrl = "https://sqs.us-east-1.amazonaws.com/123456789/resolver-1";

  beforeAll(async () => {
    mockSQS = new MockSQSClient();
    apiHelper = new ApiTestHelper({
      baseURL: "http://localhost:3001", // Resolver service port
    });
    
    await apiHelper.waitForService("/health");
  });

  beforeEach(async () => {
    mockSQS.clearAllQueues();
  });

  afterAll(async () => {
    await apiHelper.cleanup();
  });

  describe("Message Processing", () => {
    it("should consume new order messages from SQS", async () => {
      const orderMessage = {
        type: "NEW_ORDER",
        orderId: "0x123456",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: "0xabcdef",
          creationTimestamp: Math.floor(Date.now() / 1000),
          fillDeadline: Math.floor(Date.now() / 1000) + 300,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 300,
          safetyFactor: 0.95,
        },
      };

      // Add message to queue
      mockSQS.addMessageToQueue(resolverQueueUrl, orderMessage);

      // Wait for resolver to process message
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check that message was consumed
      const remainingMessages = mockSQS.getQueueMessages(resolverQueueUrl);
      expect(remainingMessages.length).toBe(0);

      // Check that message was deleted
      const deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(1);
    });

    it("should handle multiple messages in batch", async () => {
      const messages = [];
      for (let i = 0; i < 5; i++) {
        messages.push({
          type: "NEW_ORDER",
          orderId: `0x${i}23456`,
          order: {
            requester: "0x1234567890123456789012345678901234567890",
            srcChainId: 1,
            srcToken: "0x0000000000000000000000000000000000000001",
            srcAmount: "1000000000000000000",
            dstChainId: 137,
            dstToken: "0x0000000000000000000000000000000000000002",
            outputAmount: `${2000 - i * 100}000000000000000000`,
            secretHash: `0xabcdef${i}`,
            creationTimestamp: Math.floor(Date.now() / 1000),
            fillDeadline: Math.floor(Date.now() / 1000) + 300,
          },
          dutchAuctionData: {
            initialPrice: 2.0 - i * 0.1,
            finalPrice: 1.9 - i * 0.1,
            startTime: Math.floor(Date.now() / 1000),
            endTime: Math.floor(Date.now() / 1000) + 300,
            safetyFactor: 0.95,
          },
        });
      }

      // Add all messages
      messages.forEach(msg => mockSQS.addMessageToQueue(resolverQueueUrl, msg));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // All messages should be processed
      const remainingMessages = mockSQS.getQueueMessages(resolverQueueUrl);
      expect(remainingMessages.length).toBe(0);
      
      const deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(5);
    });

    it("should continue polling after processing messages", async () => {
      // Add first message
      const firstMessage = {
        type: "NEW_ORDER",
        orderId: "0x111111",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: "0xaaa",
          creationTimestamp: Math.floor(Date.now() / 1000),
          fillDeadline: Math.floor(Date.now() / 1000) + 300,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 300,
          safetyFactor: 0.95,
        },
      };

      mockSQS.addMessageToQueue(resolverQueueUrl, firstMessage);

      // Wait for first message to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify first message was processed
      let deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(1);

      // Add second message after a delay
      const secondMessage = {
        ...firstMessage,
        orderId: "0x222222",
        order: {
          ...firstMessage.order,
          secretHash: "0xbbb",
        },
      };

      mockSQS.addMessageToQueue(resolverQueueUrl, secondMessage);

      // Wait for second message to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify second message was also processed
      deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(2);
    });
  });

  describe("Message Filtering", () => {
    it("should filter messages by chain support", async () => {
      // Message for unsupported chain
      const unsupportedMessage = {
        type: "NEW_ORDER",
        orderId: "0x999999",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 999, // Unsupported chain
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 888, // Unsupported chain
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: "0xzzz",
          creationTimestamp: Math.floor(Date.now() / 1000),
          fillDeadline: Math.floor(Date.now() / 1000) + 300,
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 300,
          safetyFactor: 0.95,
        },
      };

      mockSQS.addMessageToQueue(resolverQueueUrl, unsupportedMessage);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Message should still be deleted (acknowledged) but not processed
      const deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(1);

      // Check resolver didn't commit to this order
      const response = await apiHelper.get(`/orders/${unsupportedMessage.orderId}`);
      expect(response.status).toBe(404);
    });

    it("should skip expired orders", async () => {
      const expiredMessage = {
        type: "NEW_ORDER",
        orderId: "0xexpired",
        order: {
          requester: "0x1234567890123456789012345678901234567890",
          srcChainId: 1,
          srcToken: "0x0000000000000000000000000000000000000001",
          srcAmount: "1000000000000000000",
          dstChainId: 137,
          dstToken: "0x0000000000000000000000000000000000000002",
          outputAmount: "2000000000000000000",
          secretHash: "0xexpired",
          creationTimestamp: Math.floor(Date.now() / 1000) - 600,
          fillDeadline: Math.floor(Date.now() / 1000) - 300, // Expired
        },
        dutchAuctionData: {
          initialPrice: 2.0,
          finalPrice: 1.9,
          startTime: Math.floor(Date.now() / 1000) - 600,
          endTime: Math.floor(Date.now() / 1000) - 300,
          safetyFactor: 0.95,
        },
      };

      mockSQS.addMessageToQueue(resolverQueueUrl, expiredMessage);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Message should be deleted without processing
      const deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed messages gracefully", async () => {
      // Add malformed message
      mockSQS.addMessageToQueue(resolverQueueUrl, "invalid json {");

      // Wait for processing attempt
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Message should be deleted to prevent reprocessing
      const deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(1);
    });

    it("should handle messages with missing fields", async () => {
      const incompleteMessage = {
        type: "NEW_ORDER",
        // Missing orderId and order fields
      };

      mockSQS.addMessageToQueue(resolverQueueUrl, incompleteMessage);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Message should be deleted
      const deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(1);
    });

    it("should reconnect after SQS errors", async () => {
      // Simulate SQS error
      const originalReceive = mockSQS.send.bind(mockSQS);
      let errorCount = 0;
      
      mockSQS.send = async (command: any) => {
        if (command.constructor.name === "ReceiveMessageCommand" && errorCount < 3) {
          errorCount++;
          throw new Error("SQS temporary failure");
        }
        return originalReceive(command);
      };

      // Add message after errors resolve
      setTimeout(() => {
        mockSQS.addMessageToQueue(resolverQueueUrl, {
          type: "NEW_ORDER",
          orderId: "0xrecovery",
          order: {
            requester: "0x1234567890123456789012345678901234567890",
            srcChainId: 1,
            srcToken: "0x0000000000000000000000000000000000000001",
            srcAmount: "1000000000000000000",
            dstChainId: 137,
            dstToken: "0x0000000000000000000000000000000000000002",
            outputAmount: "2000000000000000000",
            secretHash: "0xrecovery",
            creationTimestamp: Math.floor(Date.now() / 1000),
            fillDeadline: Math.floor(Date.now() / 1000) + 300,
          },
          dutchAuctionData: {
            initialPrice: 2.0,
            finalPrice: 1.9,
            startTime: Math.floor(Date.now() / 1000),
            endTime: Math.floor(Date.now() / 1000) + 300,
            safetyFactor: 0.95,
          },
        });
      }, 1500);

      // Wait for recovery and processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should eventually process the message
      const deletedMessages = mockSQS.getDeletedMessages(resolverQueueUrl);
      expect(deletedMessages.length).toBe(1);
      expect(errorCount).toBe(3);
    });
  });
});