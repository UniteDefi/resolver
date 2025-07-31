import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import { ethers } from "ethers";

async function sendTestOrderToSQS() {
  const client = new SQSClient({ region: "us-east-1" });
  const queueUrl = process.env.SQS_QUEUE_URL || "https://sqs.us-east-1.amazonaws.com/851725552040/UniteSwapOrdersQueue";
  
  // Generate test order
  const orderId = uuidv4();
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  
  const orderData = {
    orderId,
    type: "new_order",
    swapRequest: {
      userAddress: "0x82C4Ae2bdD2f8cc387ea0c5E27963F36C1fcd0DD",
      srcChainId: 11155111, // Ethereum Sepolia
      dstChainId: 84532, // Base Sepolia
      srcToken: "0x8465d8d2c0a3228ddbfa8b0c495cd14d2dbee8ac", // USDT on Ethereum
      dstToken: "0xcc14100211626d4d6fc8751fb62c16a7d5be502f", // USDT on Base
      srcAmount: "100000000", // 100 USDT (6 decimals)
      secretHash,
      minAcceptablePrice: "950000", // 0.95 USDT per USDT (6 decimals)
      orderDuration: 300, // 5 minutes
      nonce: Date.now().toString(),
      deadline: Math.floor(Date.now() / 1000) + 86400 // 24 hours
    },
    auctionDetails: {
      startPrice: "990000", // 0.99 USDT per USDT (6 decimals)
      reservePrice: "950000", // 0.95 USDT per USDT
      duration: 180, // 3 minutes
      startTime: Date.now()
    },
    marketPrice: "1000000", // 1.0 USDT per USDT
    expiresAt: Date.now() + 180000, // 3 minutes from now
    secret: ethers.hexlify(secret),
    status: "pending"
  };

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(orderData),
    MessageAttributes: {
      orderId: {
        DataType: "String",
        StringValue: orderId
      },
      srcChainId: {
        DataType: "Number",
        StringValue: "11155111"
      },
      dstChainId: {
        DataType: "Number",
        StringValue: "84532"
      }
    }
  });

  try {
    console.log("Sending test order directly to SQS...");
    console.log("Order ID:", orderId);
    console.log("Secret Hash:", secretHash);
    console.log("Auction duration: 3 minutes");
    console.log("Start price: 0.99 USDT per USDT");
    console.log("Reserve price: 0.95 USDT per USDT");
    
    const response = await client.send(command);
    console.log("\nOrder sent successfully!");
    console.log("Message ID:", response.MessageId);
    console.log("\nMonitor the resolver logs to see the order being processed.");
    
  } catch (error) {
    console.error("Error sending message to SQS:", error);
  }
}

// Run the test
sendTestOrderToSQS();