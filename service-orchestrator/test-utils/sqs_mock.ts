import { EventEmitter } from "events";

interface SQSMessage {
  MessageId: string;
  ReceiptHandle: string;
  Body: string;
  Attributes?: Record<string, string>;
  MessageAttributes?: Record<string, any>;
}

interface SendMessageResult {
  MessageId: string;
  MD5OfMessageBody: string;
}

export class MockSQSClient extends EventEmitter {
  private queues: Map<string, SQSMessage[]> = new Map();
  private deletedMessages: Map<string, string[]> = new Map();
  private messageIdCounter = 0;

  constructor() {
    super();
    console.log("[MockSQS] Initialized mock SQS client");
  }

  /**
   * Mock send method for SQS
   */
  async send(command: any): Promise<any> {
    const commandName = command.constructor.name;

    switch (commandName) {
      case "SendMessageCommand":
        return this.handleSendMessage(command.input);
      case "ReceiveMessageCommand":
        return this.handleReceiveMessage(command.input);
      case "DeleteMessageCommand":
        return this.handleDeleteMessage(command.input);
      default:
        throw new Error(`Unsupported SQS command: ${commandName}`);
    }
  }

  /**
   * Handle SendMessage command
   */
  private async handleSendMessage(input: any): Promise<SendMessageResult> {
    const { QueueUrl, MessageBody, MessageAttributes } = input;
    
    if (!this.queues.has(QueueUrl)) {
      this.queues.set(QueueUrl, []);
    }

    const messageId = `mock-message-${++this.messageIdCounter}`;
    const message: SQSMessage = {
      MessageId: messageId,
      ReceiptHandle: `mock-receipt-${messageId}`,
      Body: MessageBody,
      MessageAttributes,
      Attributes: {
        SentTimestamp: Date.now().toString(),
      },
    };

    this.queues.get(QueueUrl)!.push(message);
    
    // Emit event for testing
    this.emit("messageSent", { queueUrl: QueueUrl, message });
    
    console.log(`[MockSQS] Sent message to ${QueueUrl}: ${messageId}`);

    return {
      MessageId: messageId,
      MD5OfMessageBody: this.mockMD5(MessageBody),
    };
  }

  /**
   * Handle ReceiveMessage command
   */
  private async handleReceiveMessage(input: any): Promise<{ Messages?: SQSMessage[] }> {
    const { QueueUrl, MaxNumberOfMessages = 1, WaitTimeSeconds = 0 } = input;
    
    const messages = this.queues.get(QueueUrl) || [];
    const availableMessages = messages.slice(0, MaxNumberOfMessages);

    if (availableMessages.length === 0 && WaitTimeSeconds > 0) {
      // Simulate long polling
      await new Promise(resolve => setTimeout(resolve, Math.min(WaitTimeSeconds * 100, 1000)));
    }

    console.log(`[MockSQS] Received ${availableMessages.length} messages from ${QueueUrl}`);

    return {
      Messages: availableMessages.length > 0 ? availableMessages : undefined,
    };
  }

  /**
   * Handle DeleteMessage command
   */
  private async handleDeleteMessage(input: any): Promise<{}> {
    const { QueueUrl, ReceiptHandle } = input;
    
    const messages = this.queues.get(QueueUrl) || [];
    const messageIndex = messages.findIndex(msg => msg.ReceiptHandle === ReceiptHandle);
    
    if (messageIndex !== -1) {
      const deletedMessage = messages.splice(messageIndex, 1)[0];
      
      if (!this.deletedMessages.has(QueueUrl)) {
        this.deletedMessages.set(QueueUrl, []);
      }
      this.deletedMessages.get(QueueUrl)!.push(deletedMessage.MessageId);
      
      console.log(`[MockSQS] Deleted message from ${QueueUrl}: ${deletedMessage.MessageId}`);
    }

    return {};
  }

  /**
   * Add a message directly to a queue (for testing)
   */
  addMessageToQueue(queueUrl: string, messageBody: any, attributes?: any): void {
    if (!this.queues.has(queueUrl)) {
      this.queues.set(queueUrl, []);
    }

    const messageId = `mock-message-${++this.messageIdCounter}`;
    const message: SQSMessage = {
      MessageId: messageId,
      ReceiptHandle: `mock-receipt-${messageId}`,
      Body: typeof messageBody === "string" ? messageBody : JSON.stringify(messageBody),
      MessageAttributes: attributes,
      Attributes: {
        SentTimestamp: Date.now().toString(),
      },
    };

    this.queues.get(queueUrl)!.push(message);
    console.log(`[MockSQS] Added test message to ${queueUrl}: ${messageId}`);
  }

  /**
   * Get all messages in a queue
   */
  getQueueMessages(queueUrl: string): SQSMessage[] {
    return this.queues.get(queueUrl) || [];
  }

  /**
   * Get deleted message IDs for a queue
   */
  getDeletedMessages(queueUrl: string): string[] {
    return this.deletedMessages.get(queueUrl) || [];
  }

  /**
   * Clear all queues
   */
  clearAllQueues(): void {
    this.queues.clear();
    this.deletedMessages.clear();
    this.messageIdCounter = 0;
    console.log("[MockSQS] Cleared all queues");
  }

  /**
   * Mock MD5 hash function
   */
  private mockMD5(data: string): string {
    return Buffer.from(data).toString("base64").substring(0, 32);
  }
}

/**
 * Mock SQS command classes
 */
export class SendMessageCommand {
  constructor(public input: any) {}
}

export class ReceiveMessageCommand {
  constructor(public input: any) {}
}

export class DeleteMessageCommand {
  constructor(public input: any) {}
}