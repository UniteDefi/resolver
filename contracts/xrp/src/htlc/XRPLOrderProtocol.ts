import { XRPLHTLCOrder, XRPLTransactionResult } from "./types";
import crypto from "crypto";
import { ethers } from "ethers";

export class XRPLOrderProtocol {
  private orders: Map<string, XRPLHTLCOrder> = new Map();
  private filledAmounts: Map<string, string> = new Map();
  private invalidatedOrders: Set<string> = new Set();
  private nonces: Map<string, number> = new Map();
  private escrowAddresses: Map<string, string> = new Map(); // orderHash => escrow address

  createOrder(
    salt: string,
    maker: string,
    receiver: string | undefined,
    makerAsset: string,
    takerAsset: string,
    makingAmount: string,
    takingAmount: string, // XRP amount in drops
    deadline: number,
    nonce: number,
    srcChainId: number,
    dstChainId: number,
    auctionStartTime: number,
    auctionEndTime: number,
    startPrice: string,
    endPrice: string,
    secret?: string
  ): { order: XRPLHTLCOrder; hashlock: string; orderHash: string } {
    // Generate secret if not provided
    const orderSecret = secret || crypto.randomBytes(32).toString('hex');
    const hashlock = crypto.createHash('sha256').update(Buffer.from(orderSecret.replace('0x', ''), 'hex')).digest('hex');
    
    const order: XRPLHTLCOrder = {
      orderHash: "", // Will be set below
      salt,
      maker,
      receiver,
      taker: undefined, // Optional specific taker
      makerAsset,
      takerAsset,
      makingAmount,
      takingAmount,
      deadline,
      nonce,
      srcChainId,
      dstChainId,
      hashlock: `0x${hashlock}`,
      auctionStartTime,
      auctionEndTime,
      startPrice,
      endPrice,
    };

    // Generate order hash matching EVM implementation
    const orderHash = this.hashOrder(order);
    order.orderHash = orderHash;

    this.orders.set(orderHash, order);
    this.filledAmounts.set(orderHash, "0");

    return { order, hashlock: `0x${hashlock}`, orderHash };
  }

  // Hash order matching EVM implementation exactly
  hashOrder(order: XRPLHTLCOrder): string {
    // This matches the EVM implementation's keccak256 encoding
    const orderTypeHash = ethers.keccak256(
      ethers.toUtf8Bytes(
        "Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId,uint256 auctionStartTime,uint256 auctionEndTime,uint256 startPrice,uint256 endPrice)"
      )
    );

    // For XRPL addresses, we need to convert them to a format compatible with EVM hashing
    // We'll use a deterministic conversion to ensure consistency
    const makerBytes = this.xrplAddressToBytes32(order.maker);
    const receiverBytes = order.receiver ? this.xrplAddressToBytes32(order.receiver) : ethers.ZeroAddress;
    const makerAssetBytes = order.makerAsset === "XRP" ? ethers.ZeroAddress : order.makerAsset;
    const takerAssetBytes = order.takerAsset === "XRP" ? ethers.ZeroAddress : order.takerAsset;

    // Convert salt from hex string to BigInt if it's a hex string
    const saltValue = order.salt.startsWith('0x') || /^[0-9a-fA-F]+$/.test(order.salt) 
      ? BigInt('0x' + order.salt.replace('0x', ''))
      : BigInt(order.salt);

    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address", "address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [
        orderTypeHash,
        saltValue.toString(),
        makerBytes,
        receiverBytes,
        makerAssetBytes,
        takerAssetBytes,
        order.makingAmount,
        order.takingAmount,
        order.deadline,
        order.nonce,
        order.srcChainId,
        order.dstChainId,
        order.auctionStartTime,
        order.auctionEndTime,
        order.startPrice,
        order.endPrice
      ]
    );

    return ethers.keccak256(encodedData);
  }

  // Convert XRPL address to a deterministic bytes32 representation
  private xrplAddressToBytes32(xrplAddress: string): string {
    // Use keccak256 of the XRPL address to get a deterministic 20-byte value
    // Then pad to match Ethereum address format
    const hash = ethers.keccak256(ethers.toUtf8Bytes(xrplAddress));
    // Take first 20 bytes to match Ethereum address length
    return "0x" + hash.substring(26); // Remove 0x prefix and take last 40 chars (20 bytes)
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
    
    const filled = BigInt(this.filledAmounts.get(orderHash) || "0");
    const total = BigInt(order.makingAmount);
    
    const remaining = total - filled;
    return remaining > 0n ? remaining.toString() : "0";
  }

  addPartialFill(orderHash: string, amount: string): boolean {
    const order = this.orders.get(orderHash);
    if (!order || this.invalidatedOrders.has(orderHash)) {
      return false;
    }

    const currentFilled = BigInt(this.filledAmounts.get(orderHash) || "0");
    const fillAmount = BigInt(amount);
    const totalAmount = BigInt(order.makingAmount);

    if (currentFilled + fillAmount > totalAmount) {
      return false; // Would exceed order amount
    }

    const newFilled = currentFilled + fillAmount;
    this.filledAmounts.set(orderHash, newFilled.toString());

    // Mark as fully filled if complete
    if (newFilled >= totalAmount) {
      this.invalidatedOrders.add(orderHash);
      // Increment nonce for the maker
      const currentNonce = this.nonces.get(order.maker) || 0;
      this.nonces.set(order.maker, currentNonce + 1);
    }

    return true;
  }

  isOrderValid(orderHash: string): boolean {
    const order = this.orders.get(orderHash);
    if (!order || this.invalidatedOrders.has(orderHash)) {
      return false;
    }

    // Check deadline
    if (Date.now() / 1000 >= order.deadline) {
      return false;
    }

    // Check nonce
    const currentNonce = this.nonces.get(order.maker) || 0;
    if (order.nonce !== currentNonce) {
      return false;
    }

    return true;
  }

  isOrderFullyFilled(orderHash: string): boolean {
    return this.invalidatedOrders.has(orderHash);
  }

  cancelOrder(orderHash: string, caller: string): boolean {
    const order = this.orders.get(orderHash);
    if (!order) {
      return false;
    }

    // Only maker can cancel
    if (caller !== order.maker) {
      return false;
    }

    if (this.invalidatedOrders.has(orderHash)) {
      return false; // Already invalidated
    }

    this.invalidatedOrders.add(orderHash);
    return true;
  }

  getNonce(address: string): number {
    return this.nonces.get(address) || 0;
  }

  getEscrowAddress(orderHash: string): string | undefined {
    return this.escrowAddresses.get(orderHash);
  }

  setEscrowAddress(orderHash: string, escrowAddress: string): void {
    if (!this.escrowAddresses.has(orderHash)) {
      this.escrowAddresses.set(orderHash, escrowAddress);
    }
  }

  // Update fill amount from destination chain
  updateFillAmount(orderHash: string, fillAmount: string): boolean {
    const order = this.orders.get(orderHash);
    if (!order) {
      return false;
    }

    const currentFilled = BigInt(this.filledAmounts.get(orderHash) || "0");
    const newAmount = BigInt(fillAmount);
    const totalAmount = BigInt(order.makingAmount);

    const newFilled = currentFilled + newAmount;
    this.filledAmounts.set(orderHash, newFilled.toString());

    // Mark as fully filled if complete
    if (newFilled >= totalAmount) {
      this.invalidatedOrders.add(orderHash);
      const currentNonce = this.nonces.get(order.maker) || 0;
      this.nonces.set(order.maker, currentNonce + 1);
    }

    return true;
  }
}
