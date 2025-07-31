import { ethers } from "ethers";
import { SQSOrderMessage } from "./sqs_listener_service";

// Direct import to test
async function testResolverWithMockOrder() {
  // Create a mock message
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  const orderId = ethers.id("test-order-" + Date.now());
  
  const mockMessage: SQSOrderMessage = {
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

  console.log("Mock order created:");
  console.log("- Order ID:", orderId);
  console.log("- Secret Hash:", secretHash);
  console.log("- Source: 100 USDT on Ethereum Sepolia");
  console.log("- Destination: USDT on Base Sepolia");
  console.log("- Auction: 0.99 -> 0.95 USDT per USDT over 3 minutes");
  console.log("- User:", mockMessage.swapRequest.userAddress);
  
  console.log("\nTo test the resolver:");
  console.log("1. Make sure resolver is running");
  console.log("2. The resolver should process this order if you modify it to inject test messages");
  console.log("\nMock message data:", JSON.stringify(mockMessage, null, 2));
  
  // For actual testing, you would need to:
  // 1. Modify the SQS listener to accept test messages
  // 2. Or create a test endpoint in the resolver that accepts mock messages
  // 3. Or use a local SQS emulator
}

testResolverWithMockOrder();