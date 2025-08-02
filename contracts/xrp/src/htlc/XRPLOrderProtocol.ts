import { XRPLHTLCOrder, XRPLTransactionResult } from "./types";
import crypto from "crypto";

export class XRPLOrderProtocol {
  private orders: Map<string, XRPLHTLCOrder> = new Map();
  private filledAmounts: Map<string, string> = new Map();
  private invalidatedOrders: Set<string> = new Set();

  createOrder(
    maker: string,
    makerAsset: string,
    makingAmount: string,
    takingAmount: string, // XRP amount in drops
    deadline: number,
    srcChainId: number,
    secret?: string
  ): { order: XRPLHTLCOrder; hashlock: string } {
    // Generate secret if not provided
    const orderSecret = secret || crypto.randomBytes(32).toString('hex');
    const hashlock = crypto.createHash('sha256').update(Buffer.from(orderSecret.replace('0x', ''), 'hex')).digest('hex');
    
    const order: XRPLHTLCOrder = {
      orderHash: this.generateOrderHash(maker, makerAsset, makingAmount, takingAmount, deadline),
      maker,
      makerAsset,
      takerAsset: "XRP",
      makingAmount,
      takingAmount,
      deadline,
      srcChainId,
      dstChainId: 0, // XRPL identifier
      hashlock: `0x${hashlock}`,
    };

    this.orders.set(order.orderHash, order);
    this.filledAmounts.set(order.orderHash, "0");

    return { order, hashlock: `0x${hashlock}` };
  }

  private generateOrderHash(
    maker: string,
    makerAsset: string,
    makingAmount: string,
    takingAmount: string,
    deadline: number
  ): string {
    const data = `${maker}${makerAsset}${makingAmount}${takingAmount}${deadline}${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  getOrder(orderHash: string): XRPLHTLCOrder | undefined {
    return this.orders.get(orderHash);
  }

  getFilledAmount(orderHash: string): string {
    return this.filledAmounts.get(orderHash) || "0";
  }

  getRemainingAmount(orderHash: string): string {
    const order = this.orders.get(orderHash);
    if (!order) return "0";
    
    const filled = parseInt(this.filledAmounts.get(orderHash) || "0");
    const total = parseInt(order.takingAmount);
    
    return Math.max(0, total - filled).toString();
  }

  addPartialFill(orderHash: string, amount: string): boolean {
    const order = this.orders.get(orderHash);
    if (!order || this.invalidatedOrders.has(orderHash)) {
      return false;
    }

    const currentFilled = parseInt(this.filledAmounts.get(orderHash) || "0");
    const fillAmount = parseInt(amount);
    const totalAmount = parseInt(order.takingAmount);

    if (currentFilled + fillAmount > totalAmount) {
      return false; // Would exceed order amount
    }

    const newFilled = currentFilled + fillAmount;
    this.filledAmounts.set(orderHash, newFilled.toString());

    // Mark as fully filled if complete
    if (newFilled >= totalAmount) {
      this.invalidatedOrders.add(orderHash);
    }

    return true;
  }

  isOrderValid(orderHash: string): boolean {
    const order = this.orders.get(orderHash);
    if (!order || this.invalidatedOrders.has(orderHash)) {
      return false;
    }

    return Date.now() / 1000 < order.deadline;
  }

  cancelOrder(orderHash: string): boolean {
    if (this.orders.has(orderHash)) {
      this.invalidatedOrders.add(orderHash);
      return true;
    }
    return false;
  }
}
