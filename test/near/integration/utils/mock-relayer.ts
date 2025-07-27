import { EventEmitter } from "events";
import { ethers } from "ethers";
import * as crypto from "crypto";

export interface SwapOrder {
  orderId: string;
  user: string;
  sourceChain: "near" | "base-sepolia";
  destChain: "near" | "base-sepolia";
  sourceToken: string;
  destToken: string;
  sourceAmount: string;
  destAmount: string;
  secretHash: string;
  secret: string;
  deadline: number;
  destRecipient: string;
  marketPrice: string;
  isCompleted: boolean;
  isCancelled: boolean;
}

export interface ResolverCommitment {
  resolver: string;
  orderId: string;
  sourceEscrow: string;
  destEscrow: string;
  commitTime: number;
  isActive: boolean;
  isCompleted: boolean;
}

export class MockRelayerService extends EventEmitter {
  private orders: Map<string, SwapOrder> = new Map();
  private commitments: Map<string, ResolverCommitment> = new Map();
  private authorizedResolvers: Set<string> = new Set();
  private orderBroadcastInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startOrderBroadcast();
  }

  // User submits swap order
  submitOrder(orderParams: {
    user: string;
    sourceChain: "near" | "base-sepolia";
    destChain: "near" | "base-sepolia";
    sourceToken: string;
    destToken: string;
    sourceAmount: string;
    destAmount: string;
    destRecipient: string;
    deadline: number;
  }): { orderId: string; secretHash: string } {
    const secret = crypto.randomBytes(32).toString("hex");
    const secretHash = ethers.sha256(ethers.toUtf8Bytes(secret));
    
    const orderId = crypto.randomBytes(16).toString("hex");
    
    // Calculate market price with 2% spread
    const basePrice = parseFloat(orderParams.destAmount) / parseFloat(orderParams.sourceAmount);
    const marketPrice = (basePrice * 1.02).toString();

    const order: SwapOrder = {
      orderId,
      user: orderParams.user,
      sourceChain: orderParams.sourceChain,
      destChain: orderParams.destChain,
      sourceToken: orderParams.sourceToken,
      destToken: orderParams.destToken,
      sourceAmount: orderParams.sourceAmount,
      destAmount: orderParams.destAmount,
      secretHash,
      secret,
      deadline: orderParams.deadline,
      destRecipient: orderParams.destRecipient,
      marketPrice,
      isCompleted: false,
      isCancelled: false,
    };

    this.orders.set(orderId, order);
    
    console.log(`[MockRelayer] Order created: ${orderId}`);
    console.log(`[MockRelayer] ${orderParams.sourceAmount} ${orderParams.sourceToken} → ${orderParams.destAmount} ${orderParams.destToken}`);
    console.log(`[MockRelayer] Market price: ${marketPrice} ${orderParams.destToken} per ${orderParams.sourceToken}`);

    return { orderId, secretHash };
  }

  // Resolver commits to fulfilling an order
  commitToOrder(resolverAddress: string, orderId: string, sourceEscrow: string, destEscrow: string): boolean {
    if (!this.authorizedResolvers.has(resolverAddress)) {
      console.log(`[MockRelayer] Unauthorized resolver: ${resolverAddress}`);
      return false;
    }

    const order = this.orders.get(orderId);
    if (!order) {
      console.log(`[MockRelayer] Order not found: ${orderId}`);
      return false;
    }

    if (this.commitments.has(orderId)) {
      console.log(`[MockRelayer] Order already committed: ${orderId}`);
      return false;
    }

    if (Date.now() > order.deadline) {
      console.log(`[MockRelayer] Order expired: ${orderId}`);
      return false;
    }

    const commitment: ResolverCommitment = {
      resolver: resolverAddress,
      orderId,
      sourceEscrow,
      destEscrow,
      commitTime: Date.now(),
      isActive: true,
      isCompleted: false,
    };

    this.commitments.set(orderId, commitment);
    
    console.log(`[MockRelayer] Resolver ${resolverAddress} committed to order ${orderId}`);
    console.log(`[MockRelayer] Source escrow: ${sourceEscrow}`);
    console.log(`[MockRelayer] Dest escrow: ${destEscrow}`);
    console.log(`[MockRelayer] 5-minute execution timer started`);

    // Emit commitment event for tests
    this.emit("orderCommitted", { orderId, resolver: resolverAddress, commitment });

    return true;
  }

  // Relayer transfers user funds to source escrow
  async transferUserFunds(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    const commitment = this.commitments.get(orderId);

    if (!order || !commitment) {
      console.log(`[MockRelayer] Invalid order or commitment for transfer: ${orderId}`);
      return false;
    }

    console.log(`[MockRelayer] Transferring user funds for order ${orderId}`);
    console.log(`[MockRelayer] Amount: ${order.sourceAmount} ${order.sourceToken}`);
    console.log(`[MockRelayer] From: ${order.user} → To: ${commitment.sourceEscrow}`);

    // Simulate successful transfer
    this.emit("userFundsTransferred", { orderId, amount: order.sourceAmount, token: order.sourceToken });
    
    return true;
  }

  // Resolver notifies completion
  notifyDestinationComplete(orderId: string, resolverAddress: string, txHash: string): boolean {
    const commitment = this.commitments.get(orderId);
    
    if (!commitment || commitment.resolver !== resolverAddress) {
      console.log(`[MockRelayer] Invalid completion notification for order ${orderId}`);
      return false;
    }

    console.log(`[MockRelayer] Resolver ${resolverAddress} completed destination for order ${orderId}`);
    console.log(`[MockRelayer] Transaction hash: ${txHash}`);
    console.log(`[MockRelayer] Waiting for block confirmations...`);

    // Simulate confirmation wait
    setTimeout(() => {
      this.completeOrder(orderId);
    }, 2000); // 2 second confirmation delay

    return true;
  }

  // Relayer completes the order by revealing secret
  private completeOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    const commitment = this.commitments.get(orderId);

    if (!order || !commitment) {
      console.log(`[MockRelayer] Cannot complete order ${orderId} - missing data`);
      return;
    }

    console.log(`[MockRelayer] Block confirmations received for order ${orderId}`);
    console.log(`[MockRelayer] Revealing secret to unlock destination funds`);

    order.isCompleted = true;
    commitment.isCompleted = true;

    this.orders.set(orderId, order);
    this.commitments.set(orderId, commitment);

    // Emit completion event with secret
    this.emit("orderCompleted", { 
      orderId, 
      secret: order.secret, 
      resolver: commitment.resolver 
    });

    console.log(`[MockRelayer] Order ${orderId} completed successfully!`);
    console.log(`[MockRelayer] Secret revealed: ${order.secret.substring(0, 16)}...`);
  }

  // Rescue mechanism for failed orders
  rescueOrder(rescuerAddress: string, orderId: string, newSourceEscrow: string, newDestEscrow: string): boolean {
    if (!this.authorizedResolvers.has(rescuerAddress)) {
      console.log(`[MockRelayer] Unauthorized rescuer: ${rescuerAddress}`);
      return false;
    }

    const order = this.orders.get(orderId);
    const commitment = this.commitments.get(orderId);

    if (!order || !commitment) {
      console.log(`[MockRelayer] Order not found for rescue: ${orderId}`);
      return false;
    }

    if (order.isCompleted) {
      console.log(`[MockRelayer] Order already completed: ${orderId}`);
      return false;
    }

    const timeoutReached = Date.now() > commitment.commitTime + (5 * 60 * 1000); // 5 minutes
    if (!timeoutReached) {
      console.log(`[MockRelayer] Execution timeout not reached for order ${orderId}`);
      return false;
    }

    if (rescuerAddress === commitment.resolver) {
      console.log(`[MockRelayer] Resolver cannot rescue own order: ${orderId}`);
      return false;
    }

    const originalResolver = commitment.resolver;

    // Update commitment to new resolver
    commitment.resolver = rescuerAddress;
    commitment.sourceEscrow = newSourceEscrow;
    commitment.destEscrow = newDestEscrow;
    commitment.commitTime = Date.now();

    this.commitments.set(orderId, commitment);

    console.log(`[MockRelayer] Order ${orderId} rescued by ${rescuerAddress}`);
    console.log(`[MockRelayer] Original resolver ${originalResolver} loses safety deposits`);
    
    this.emit("orderRescued", { orderId, rescuer: rescuerAddress, originalResolver });

    return true;
  }

  // Utility methods
  authorizeResolver(resolverAddress: string): void {
    this.authorizedResolvers.add(resolverAddress);
    console.log(`[MockRelayer] Authorized resolver: ${resolverAddress}`);
  }

  getOrder(orderId: string): SwapOrder | undefined {
    return this.orders.get(orderId);
  }

  getCommitment(orderId: string): ResolverCommitment | undefined {
    return this.commitments.get(orderId);
  }

  getAllActiveOrders(): SwapOrder[] {
    return Array.from(this.orders.values()).filter(order => 
      !order.isCompleted && !order.isCancelled && Date.now() < order.deadline
    );
  }

  getAvailableOrders(): SwapOrder[] {
    return this.getAllActiveOrders().filter(order => 
      !this.commitments.has(order.orderId)
    );
  }

  getRescuableOrders(): SwapOrder[] {
    return this.getAllActiveOrders().filter(order => {
      const commitment = this.commitments.get(order.orderId);
      return commitment && 
             !commitment.isCompleted && 
             Date.now() > commitment.commitTime + (5 * 60 * 1000);
    });
  }

  // Broadcast orders to resolvers
  private startOrderBroadcast(): void {
    this.orderBroadcastInterval = setInterval(() => {
      const activeOrders = this.getAllActiveOrders();
      if (activeOrders.length > 0) {
        this.emit("orderBroadcast", { orders: activeOrders });
      }
    }, 5000); // Broadcast every 5 seconds
  }

  stopBroadcast(): void {
    if (this.orderBroadcastInterval) {
      clearInterval(this.orderBroadcastInterval);
      this.orderBroadcastInterval = null;
    }
  }

  // For testing: simulate market price changes
  updateMarketPrice(orderId: string, newPrice: string): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.marketPrice = newPrice;
      this.orders.set(orderId, order);
      console.log(`[MockRelayer] Updated market price for ${orderId}: ${newPrice}`);
    }
  }

  // Cleanup
  destroy(): void {
    this.stopBroadcast();
    this.removeAllListeners();
    this.orders.clear();
    this.commitments.clear();
    this.authorizedResolvers.clear();
  }
}