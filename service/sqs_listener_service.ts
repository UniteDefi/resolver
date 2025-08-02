import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  DeleteMessageCommandInput,
  ReceiveMessageCommandInput,
  Message,
  SQSClientConfig,
} from "@aws-sdk/client-sqs";
import dotenv from "dotenv";

dotenv.config();

export interface SQSOrderMessage {
  orderId: string;
  orderData: any; // OrderData type from relayer
  timestamp: number;
  auctionStartPrice: string;
  auctionEndPrice: string;
  auctionDuration: number;
  srcTokenDecimals?: number;
  dstTokenDecimals?: number;
}

export interface SQSSecretMessage {
  orderId: string;
  secret: string;
  resolverAddress: string;
  srcEscrowAddress: string;
  dstEscrowAddress: string;
  srcChainId: number;
  dstChainId: number;
  srcAmount: string;
  dstAmount: string;
  timestamp: number;
  competitionDeadline: number;
}

export class SQSListenerService {
  private sqsClient: SQSClient;
  private queueUrl: string =
    "https://sqs.us-east-1.amazonaws.com/112639119226/UniteDefiIntentQueue";
  private secretsQueueUrl: string =
    "https://sqs.us-east-1.amazonaws.com/112639119226/SecretsQueue";
  private readonly queueName: string = "UniteDefiIntentQueue";
  private readonly secretsQueueName: string = "SecretsQueue";
  private isListening: boolean = false;
  private isSecretsListening: boolean = false;
  private messageHandler: ((message: SQSOrderMessage, receiptHandle?: string) => Promise<void>) | null =
    null;
  private secretHandler: ((message: SQSSecretMessage, receiptHandle?: string) => Promise<void>) | null =
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
    handler: (message: SQSOrderMessage, receiptHandle?: string) => Promise<void>
  ): void {
    this.messageHandler = handler;
  }

  setSecretHandler(
    handler: (message: SQSSecretMessage, receiptHandle?: string) => Promise<void>
  ): void {
    this.secretHandler = handler;
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

  async startSecretsListening(): Promise<void> {
    if (!this.secretHandler) {
      throw new Error("Secret handler not set. Call setSecretHandler first.");
    }

    this.isSecretsListening = true;
    console.log("[SQS Listener] Started listening for secrets...");

    // Long polling loop
    while (this.isSecretsListening) {
      try {
        await this.pollSecrets();
      } catch (error) {
        console.error("[SQS Listener] Error polling secrets:", error);
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
      VisibilityTimeout: 30, // 30 seconds - short timeout to allow other resolvers to see message quickly
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
        // Pass the receipt handle so the handler can delete if it commits
        await this.messageHandler(orderMessage, message.ReceiptHandle);
      }

      // DO NOT delete message here - let the resolver delete it only if it commits
      // This allows other resolvers to see and process the same order
      console.log(
        `[SQS Listener] Processed order ${orderMessage.orderId} (message remains in queue)`
      );
    } catch (error) {
      console.error("[SQS Listener] Error processing message:", error);
      // Message will become visible again after VisibilityTimeout
      // allowing another resolver to try
    }
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
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

  stopSecretsListening(): void {
    this.isSecretsListening = false;
    console.log("[SQS Listener] Stopping secrets listener...");
  }

  private async pollSecrets(): Promise<void> {
    const params: ReceiveMessageCommandInput = {
      QueueUrl: this.secretsQueueUrl!,
      MaxNumberOfMessages: 10, // Process up to 10 messages at once
      WaitTimeSeconds: 20, // Long polling
      VisibilityTimeout: 30, // 30 seconds - short timeout for competitive processing
      MessageAttributeNames: ["All"],
      AttributeNames: ["All"],
    };

    const command = new ReceiveMessageCommand(params);
    const response = await this.sqsClient.send(command);

    if (response.Messages && response.Messages.length > 0) {
      console.log(
        `[SQS Listener] Received ${response.Messages.length} secret messages`
      );

      // Process messages in parallel
      const processPromises = response.Messages.map((message) =>
        this.processSecretMessage(message)
      );

      await Promise.allSettled(processPromises);
    }
  }

  private async processSecretMessage(message: Message): Promise<void> {
    try {
      if (!message.Body) {
        console.error("[SQS Listener] Received secret message without body");
        return;
      }

      // Parse the message
      const secretMessage: SQSSecretMessage = JSON.parse(message.Body);

      console.log(`[SQS Listener] 🏁 Competition opportunity for order ${secretMessage.orderId}`);
      console.log(`[SQS Listener] Original resolver: ${secretMessage.resolverAddress}`);
      console.log(`[SQS Listener] Competition deadline: ${new Date(secretMessage.competitionDeadline).toISOString()}`);

      // Call the secret handler
      if (this.secretHandler) {
        await this.secretHandler(secretMessage, message.ReceiptHandle);
      }

      console.log(
        `[SQS Listener] Processed secret for order ${secretMessage.orderId} (message remains in queue)`
      );
    } catch (error) {
      console.error("[SQS Listener] Error processing secret message:", error);
      // Message will become visible again after VisibilityTimeout
      // allowing another resolver to try
    }
  }

  async deleteSecretMessage(receiptHandle: string): Promise<void> {
    const params: DeleteMessageCommandInput = {
      QueueUrl: this.secretsQueueUrl!,
      ReceiptHandle: receiptHandle,
    };

    const command = new DeleteMessageCommand(params);
    await this.sqsClient.send(command);
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
    
    // Prices are already in human-readable format (e.g., "102.0", "95.0")
    // No need to parse/format with decimals
    const startPriceFloat = parseFloat(startPrice);
    const endPriceFloat = parseFloat(endPrice);
    
    // Linear interpolation between start and end price
    const priceDiff = startPriceFloat - endPriceFloat;
    const currentPriceFloat = startPriceFloat - (priceDiff * progress);
    
    // Return as string with appropriate precision
    return currentPriceFloat.toFixed(6);
  }
}
