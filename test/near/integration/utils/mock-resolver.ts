import { EventEmitter } from "events";
import { MockRelayerService, SwapOrder } from "./mock-relayer";
import { ethers } from "ethers";
import * as crypto from "crypto";

export interface ResolverConfig {
  address: string;
  name: string;
  profitMargin: number; // Percentage profit margin (e.g., 0.5 for 0.5%)
  maxOrderSize: string; // Maximum order size they can handle
  supportedTokens: string[]; // Tokens they support
  safetyDepositETH: string; // ETH safety deposit amount
  safetyDepositNEAR: string; // NEAR safety deposit amount
}

export class MockResolver extends EventEmitter {
  private config: ResolverConfig;
  private relayer: MockRelayerService;
  private isActive: boolean = true;
  private commitments: Map<string, { orderId: string; commitTime: number }> = new Map();

  constructor(config: ResolverConfig, relayer: MockRelayerService) {
    super();
    this.config = config;
    this.relayer = relayer;
    
    // Register with relayer
    this.relayer.authorizeResolver(this.config.address);
    
    // Listen to order broadcasts
    this.relayer.on("orderBroadcast", this.handleOrderBroadcast.bind(this));
    this.relayer.on("orderCommitted", this.handleOrderCommitted.bind(this));
    this.relayer.on("orderCompleted", this.handleOrderCompleted.bind(this));
    this.relayer.on("orderRescued", this.handleOrderRescued.bind(this));

    console.log(`[${this.config.name}] Resolver initialized`);
    console.log(`[${this.config.name}] Address: ${this.config.address}`);
    console.log(`[${this.config.name}] Profit margin: ${this.config.profitMargin}%`);
    console.log(`[${this.config.name}] Max order size: ${this.config.maxOrderSize}`);
  }

  private handleOrderBroadcast(data: { orders: SwapOrder[] }): void {
    if (!this.isActive) return;

    const availableOrders = data.orders.filter(order => 
      !this.relayer.getCommitment(order.orderId) && this.isOrderSuitable(order)
    );

    for (const order of availableOrders) {
      if (this.shouldCommitToOrder(order)) {
        this.commitToOrder(order);
        break; // Only commit to one order at a time
      }
    }

    // Check for rescuable orders
    const rescuableOrders = this.relayer.getRescuableOrders();
    for (const order of rescuableOrders) {
      if (this.shouldRescueOrder(order)) {
        this.rescueOrder(order);
        break;
      }
    }
  }

  private isOrderSuitable(order: SwapOrder): boolean {
    // Check if order size is within limits
    const orderSize = parseFloat(order.sourceAmount);
    const maxSize = parseFloat(this.config.maxOrderSize);
    if (orderSize > maxSize) {
      return false;
    }

    // Check if tokens are supported
    if (!this.config.supportedTokens.includes(order.sourceToken) || 
        !this.config.supportedTokens.includes(order.destToken)) {
      return false;
    }

    return true;
  }

  private shouldCommitToOrder(order: SwapOrder): boolean {
    // Calculate potential profit
    const sourceAmount = parseFloat(order.sourceAmount);
    const destAmount = parseFloat(order.destAmount);
    const marketPrice = parseFloat(order.marketPrice);
    
    // Expected profit = (market_price - dest_amount) * source_amount
    const expectedProfit = (marketPrice - destAmount / sourceAmount) * sourceAmount;
    const minProfit = sourceAmount * (this.config.profitMargin / 100);

    console.log(`[${this.config.name}] Evaluating order ${order.orderId.substring(0, 8)}...`);
    console.log(`[${this.config.name}] Expected profit: ${expectedProfit.toFixed(6)}`);
    console.log(`[${this.config.name}] Minimum profit: ${minProfit.toFixed(6)}`);

    return expectedProfit >= minProfit;
  }

  private shouldRescueOrder(order: SwapOrder): boolean {
    // More aggressive on rescue orders due to safety deposit rewards
    const sourceAmount = parseFloat(order.sourceAmount);
    const maxSize = parseFloat(this.config.maxOrderSize);
    
    return sourceAmount <= maxSize && 
           this.config.supportedTokens.includes(order.sourceToken) &&
           this.config.supportedTokens.includes(order.destToken);
  }

  private async commitToOrder(order: SwapOrder): Promise<void> {
    try {
      console.log(`[${this.config.name}] Committing to order ${order.orderId}`);
      
      // Generate escrow addresses (simulated)
      const sourceEscrowId = `${order.sourceChain}-escrow-${crypto.randomBytes(8).toString("hex")}`;
      const destEscrowId = `${order.destChain}-escrow-${crypto.randomBytes(8).toString("hex")}`;
      
      // Simulate creating escrows with safety deposits
      console.log(`[${this.config.name}] Creating source escrow: ${sourceEscrowId}`);
      console.log(`[${this.config.name}] Safety deposit: ${order.sourceChain === "near" ? this.config.safetyDepositNEAR : this.config.safetyDepositETH}`);
      
      console.log(`[${this.config.name}] Creating destination escrow: ${destEscrowId}`);
      console.log(`[${this.config.name}] Safety deposit: ${order.destChain === "near" ? this.config.safetyDepositNEAR : this.config.safetyDepositETH}`);
      console.log(`[${this.config.name}] Depositing ${order.destAmount} ${order.destToken} to destination escrow`);

      // Commit to relayer
      const success = this.relayer.commitToOrder(
        this.config.address,
        order.orderId,
        sourceEscrowId,
        destEscrowId
      );

      if (success) {
        this.commitments.set(order.orderId, {
          orderId: order.orderId,
          commitTime: Date.now()
        });

        console.log(`[${this.config.name}] Successfully committed to order ${order.orderId}`);
        
        // Simulate notifying relayer that escrows are ready
        setTimeout(() => {
          console.log(`[${this.config.name}] Escrows deployed, notifying relayer`);
          this.emit("escrowsReady", { orderId: order.orderId, resolver: this.config.address });
        }, 1000);

        // Simulate completing destination side
        setTimeout(() => {
          this.completeDestinationSide(order.orderId);
        }, 3000);
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error committing to order:`, error);
    }
  }

  private async rescueOrder(order: SwapOrder): Promise<void> {
    try {
      console.log(`[${this.config.name}] Rescuing order ${order.orderId}`);
      console.log(`[${this.config.name}] Original resolver failed to complete within 5 minutes`);
      
      const sourceEscrowId = `${order.sourceChain}-rescue-escrow-${crypto.randomBytes(8).toString("hex")}`;
      const destEscrowId = `${order.destChain}-rescue-escrow-${crypto.randomBytes(8).toString("hex")}`;
      
      const success = this.relayer.rescueOrder(
        this.config.address,
        order.orderId,
        sourceEscrowId,
        destEscrowId
      );

      if (success) {
        this.commitments.set(order.orderId, {
          orderId: order.orderId,
          commitTime: Date.now()
        });

        console.log(`[${this.config.name}] Successfully rescued order ${order.orderId}`);
        console.log(`[${this.config.name}] Will claim original resolver's safety deposits as reward`);
        
        // Complete the rescue quickly
        setTimeout(() => {
          this.completeDestinationSide(order.orderId);
        }, 2000);
      }
    } catch (error) {
      console.error(`[${this.config.name}] Error rescuing order:`, error);
    }
  }

  private async completeDestinationSide(orderId: string): Promise<void> {
    const commitment = this.commitments.get(orderId);
    if (!commitment) {
      console.error(`[${this.config.name}] No commitment found for order ${orderId}`);
      return;
    }

    console.log(`[${this.config.name}] Completing destination side for order ${orderId}`);
    
    // Simulate transaction hash
    const txHash = `0x${crypto.randomBytes(32).toString("hex")}`;
    
    const success = this.relayer.notifyDestinationComplete(
      orderId,
      this.config.address,
      txHash
    );

    if (success) {
      console.log(`[${this.config.name}] Destination completion notified for order ${orderId}`);
      console.log(`[${this.config.name}] Waiting for relayer to reveal secret...`);
    }
  }

  private handleOrderCommitted(data: { orderId: string; resolver: string }): void {
    if (data.resolver === this.config.address) {
      console.log(`[${this.config.name}] Order ${data.orderId} commitment confirmed by relayer`);
    }
  }

  private handleOrderCompleted(data: { orderId: string; secret: string; resolver: string }): void {
    if (data.resolver === this.config.address) {
      console.log(`[${this.config.name}] Order ${data.orderId} completed!`);
      console.log(`[${this.config.name}] Secret revealed: ${data.secret.substring(0, 16)}...`);
      console.log(`[${this.config.name}] Now withdrawing from source escrow using secret`);
      
      // Simulate using secret to withdraw from source escrow
      setTimeout(() => {
        console.log(`[${this.config.name}] Successfully withdrew from source escrow`);
        console.log(`[${this.config.name}] Received source tokens + safety deposits`);
        this.emit("orderProfitRealized", { 
          orderId: data.orderId, 
          resolver: this.config.address 
        });
      }, 1500);

      this.commitments.delete(data.orderId);
    }
  }

  private handleOrderRescued(data: { orderId: string; rescuer: string; originalResolver: string }): void {
    if (data.originalResolver === this.config.address) {
      console.log(`[${this.config.name}] Order ${data.orderId} was rescued by ${data.rescuer}`);
      console.log(`[${this.config.name}] Lost safety deposits as penalty`);
      this.commitments.delete(data.orderId);
    } else if (data.rescuer === this.config.address) {
      console.log(`[${this.config.name}] Successfully rescued order ${data.orderId}`);
      console.log(`[${this.config.name}] Will claim ${data.originalResolver}'s safety deposits`);
    }
  }

  // Control methods
  setActive(active: boolean): void {
    this.isActive = active;
    console.log(`[${this.config.name}] Resolver ${active ? "activated" : "deactivated"}`);
  }

  updateProfitMargin(margin: number): void {
    this.config.profitMargin = margin;
    console.log(`[${this.config.name}] Updated profit margin to ${margin}%`);
  }

  getStats(): any {
    return {
      address: this.config.address,
      name: this.config.name,
      isActive: this.isActive,
      activeCommitments: this.commitments.size,
      profitMargin: this.config.profitMargin,
    };
  }

  destroy(): void {
    this.isActive = false;
    this.relayer.removeAllListeners();
    this.removeAllListeners();
    this.commitments.clear();
    console.log(`[${this.config.name}] Resolver destroyed`);
  }
}