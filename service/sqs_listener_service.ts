import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  DeleteMessageCommandInput,
  ReceiveMessageCommandInput,
  Message,
  SQSClientConfig,
} from "@aws-sdk/client-sqs";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

export interface SQSOrderMessage {
  orderId: string;
  orderData: any; // OrderData type from relayer
  timestamp: number;
  auctionStartPrice: string;
  auctionEndPrice: string;
  auctionDuration: number;
}

export class SQSListenerService {
  private sqsClient: SQSClient;
  private queueUrl: string =
    "https://sqs.us-east-1.amazonaws.com/112639119226/BridgeIntentQueue";
  private readonly queueName: string = "BridgeIntentQueue";
  private isListening: boolean = false;
  private messageHandler: ((message: SQSOrderMessage) => Promise<void>) | null =
    null;

  constructor() {
    const sqsConfig: SQSClientConfig = {
      region: process.env.AWS_REGION || "us-east-1",
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    };

    this.sqsClient = new SQSClient(sqsConfig);
    console.log(
      "[SQS Listener] Initialized SQS client for region:",
      sqsConfig.region
    );
  }

  setMessageHandler(
    handler: (message: SQSOrderMessage) => Promise<void>
  ): void {
    this.messageHandler = handler;
  }

  async startListening(): Promise<void> {
    if (!this.messageHandler) {
      throw new Error("Message handler not set. Call setMessageHandler first.");
    }

    this.isListening = true;
    console.log("[SQS Listener] Started listening for orders...");

    // Long polling loop
    while (this.isListening) {
      try {
        await this.pollMessages();
      } catch (error) {
        console.error("[SQS Listener] Error polling messages:", error);
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async pollMessages(): Promise<void> {
    const params: ReceiveMessageCommandInput = {
      QueueUrl: this.queueUrl!,
      MaxNumberOfMessages: 10, // Process up to 10 messages at once
      WaitTimeSeconds: 20, // Long polling
      VisibilityTimeout: 300, // 5 minutes to process
      MessageAttributeNames: ["All"],
      AttributeNames: ["All"],
    };

    const command = new ReceiveMessageCommand(params);
    const response = await this.sqsClient.send(command);

    if (response.Messages && response.Messages.length > 0) {
      console.log(
        `[SQS Listener] Received ${response.Messages.length} messages`
      );

      // Process messages in parallel
      const processPromises = response.Messages.map((message) =>
        this.processMessage(message)
      );

      await Promise.allSettled(processPromises);
    }
  }

  private async processMessage(message: Message): Promise<void> {
    try {
      if (!message.Body) {
        console.error("[SQS Listener] Received message without body");
        return;
      }

      // Parse the message
      const orderMessage: SQSOrderMessage = JSON.parse(message.Body);

      console.log(`[SQS Listener] Processing order ${orderMessage.orderId}`);
      console.log(`[SQS Listener] Order details:`, {
        orderId: orderMessage.orderId,
        srcChain: orderMessage.orderData.swapRequest.srcChainId,
        dstChain: orderMessage.orderData.swapRequest.dstChainId,
        srcAmount: orderMessage.orderData.swapRequest.srcAmount,
        timestamp: new Date(orderMessage.timestamp).toISOString(),
      });

      // Call the handler
      if (this.messageHandler) {
        await this.messageHandler(orderMessage);
      }

      // Delete message after successful processing
      await this.deleteMessage(message.ReceiptHandle!);
      console.log(
        `[SQS Listener] Successfully processed order ${orderMessage.orderId}`
      );
    } catch (error) {
      console.error("[SQS Listener] Error processing message:", error);
      // Message will become visible again after VisibilityTimeout
      // allowing another resolver to try
    }
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    const params: DeleteMessageCommandInput = {
      QueueUrl: this.queueUrl!,
      ReceiptHandle: receiptHandle,
    };

    const command = new DeleteMessageCommand(params);
    await this.sqsClient.send(command);
  }

  stopListening(): void {
    this.isListening = false;
    console.log("[SQS Listener] Stopping listener...");
  }

  // Helper method to calculate current auction price
  calculateCurrentPrice(
    startPrice: string,
    endPrice: string,
    duration: number,
    orderTimestamp: number
  ): string {
    const elapsed = Date.now() - orderTimestamp;
    if (elapsed >= duration * 1000) {
      return endPrice;
    }

    const progress = elapsed / (duration * 1000);
    const startBn = ethers.parseUnits(startPrice, 6);
    const endBn = ethers.parseUnits(endPrice, 6);

    const priceDiff = startBn - endBn;
    const currentPrice =
      startBn - (priceDiff * BigInt(Math.floor(progress * 1000))) / 1000n;

    return ethers.formatUnits(currentPrice, 6);
  }
}
