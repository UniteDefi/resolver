import { ethers } from "ethers";
import dotenv from "dotenv";
import axios from "axios";
import { SQSListenerService, SQSOrderMessage } from "./sqs_listener_service";

dotenv.config();

interface ResolverConfig {
  privateKey: string;
  relayerUrl: string;
  minProfitMargin: number; // e.g., 0.01 for 1%
  supportedChains: number[];
}

export class SQSResolverService {
  private sqsListener: SQSListenerService;
  private config: ResolverConfig;
  private wallet: ethers.Wallet;
  private processingOrders: Set<string> = new Set();
  
  constructor(config: ResolverConfig) {
    this.config = config;
    this.wallet = new ethers.Wallet(config.privateKey);
    this.sqsListener = new SQSListenerService();
    
    // Set up message handler
    this.sqsListener.setMessageHandler(this.handleOrder.bind(this));
    
    console.log("[Resolver] Initialized with address:", this.wallet.address);
    console.log("[Resolver] Supported chains:", config.supportedChains);
  }
  
  async start(): Promise<void> {
    console.log("[Resolver] Starting SQS resolver service...");
    
    // Initialize SQS listener
    await this.sqsListener.initialize();
    
    // Start listening for orders
    await this.sqsListener.startListening();
  }
  
  stop(): void {
    console.log("[Resolver] Stopping resolver service...");
    this.sqsListener.stopListening();
  }
  
  private async handleOrder(orderMessage: SQSOrderMessage): Promise<void> {
    const { orderId, orderData, timestamp, auctionStartPrice, auctionEndPrice, auctionDuration } = orderMessage;
    
    // Check if we're already processing this order
    if (this.processingOrders.has(orderId)) {
      console.log(`[Resolver] Already processing order ${orderId}, skipping`);
      return;
    }
    
    this.processingOrders.add(orderId);
    
    try {
      // Check if we support both chains
      if (!this.config.supportedChains.includes(orderData.swapRequest.srcChainId) ||
          !this.config.supportedChains.includes(orderData.swapRequest.dstChainId)) {
        console.log(`[Resolver] Unsupported chains for order ${orderId}`);
        return;
      }
      
      // Calculate current auction price
      const currentPrice = this.sqsListener.calculateCurrentPrice(
        auctionStartPrice,
        auctionEndPrice,
        auctionDuration,
        timestamp
      );
      
      console.log(`[Resolver] Current auction price for order ${orderId}: ${currentPrice}`);
      
      // Check profitability
      const isProfitable = await this.checkProfitability(orderData, currentPrice);
      if (!isProfitable) {
        console.log(`[Resolver] Order ${orderId} not profitable at current price`);
        return;
      }
      
      // Commit to the order
      await this.commitToOrder(orderId, currentPrice);
      
    } catch (error) {
      console.error(`[Resolver] Error handling order ${orderId}:`, error);
    } finally {
      this.processingOrders.delete(orderId);
    }
  }
  
  private async checkProfitability(orderData: any, currentPrice: string): Promise<boolean> {
    // Simple profitability check
    // In production, you'd check:
    // 1. Current market prices on DEXs
    // 2. Gas costs on both chains
    // 3. Your capital requirements
    // 4. Risk assessment
    
    const srcAmount = ethers.parseUnits(orderData.swapRequest.srcAmount, 6);
    const dstAmount = ethers.parseUnits(currentPrice, 6);
    
    // For this example, we'll accept if we get at least minProfitMargin
    const minAcceptable = srcAmount * BigInt(Math.floor((1 - this.config.minProfitMargin) * 10000)) / 10000n;
    
    return dstAmount >= minAcceptable;
  }
  
  private async commitToOrder(orderId: string, acceptedPrice: string): Promise<void> {
    try {
      console.log(`[Resolver] Committing to order ${orderId} at price ${acceptedPrice}`);
      
      const response = await axios.post(
        `${this.config.relayerUrl}/api/commit-resolver`,
        {
          orderId,
          resolverAddress: this.wallet.address,
          acceptedPrice,
          timestamp: Date.now()
        }
      );
      
      if (response.data.success) {
        console.log(`[Resolver] Successfully committed to order ${orderId}`);
        
        // Start the execution flow (deploy escrows, execute swap, etc.)
        // This would be handled by your existing resolver logic
        await this.executeOrder(orderId, acceptedPrice);
      }
      
    } catch (error: any) {
      console.error(`[Resolver] Failed to commit to order ${orderId}:`, error.response?.data || error.message);
    }
  }
  
  private async executeOrder(orderId: string, acceptedPrice: string): Promise<void> {
    // This is where you'd integrate with your existing resolver logic
    // 1. Deploy escrows on both chains
    // 2. Send safety deposits
    // 3. Notify relayer that escrows are ready
    // 4. Execute the cross-chain swap
    // 5. Complete the order
    
    console.log(`[Resolver] TODO: Execute order ${orderId} at price ${acceptedPrice}`);
  }
}

// Example usage
async function main() {
  const resolver = new SQSResolverService({
    privateKey: process.env.RESOLVER_PRIVATE_KEY!,
    relayerUrl: process.env.RELAYER_URL || "http://localhost:3000",
    minProfitMargin: 0.01, // 1% minimum profit
    supportedChains: [84532, 421614, 11155111] // Base Sepolia, Arbitrum Sepolia, Ethereum Sepolia
  });
  
  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Resolver] Received SIGINT, shutting down gracefully...");
    resolver.stop();
    process.exit(0);
  });
  
  // Start the resolver
  await resolver.start();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error("[Resolver] Fatal error:", error);
    process.exit(1);
  });
}