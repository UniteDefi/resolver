import { Wallet, Client, xrpToDrops, dropsToXrp, Payment } from "xrpl";
import { XRPLHTLCFactory } from "../htlc/XRPLHTLCFactory";
import { XRPLOrderProtocol } from "../htlc/XRPLOrderProtocol";
import { XRPLHTLCOrder, XRPLEscrowDetails } from "../htlc/types";
import { DutchAuctionLib } from "../utils/DutchAuctionLib";
import crypto from "crypto";

export interface XRPLImmutables {
  orderHash: string;
  hashlock: string;
  maker: string;
  taker: string;
  token: string; // "XRP" for native, or token address
  amount: string; // Total order amount
  safetyDeposit: string; // Per-unit safety deposit
  timelocks: {
    srcWithdrawal: number;
    srcCancellation: number;
    srcPublicWithdrawal: number;
    srcPublicCancellation: number;
    dstWithdrawal: number;
    dstCancellation: number;
    dstPublicWithdrawal: number;
  };
}

export class XRPLUniteResolver {
  private factory: XRPLHTLCFactory;
  private orderProtocol: XRPLOrderProtocol;
  private owner: string;
  private ownerWallet: Wallet;
  private client: Client;
  
  constructor(
    factory: XRPLHTLCFactory,
    orderProtocol: XRPLOrderProtocol,
    ownerAddress: string,
    ownerSecret: string,
    client: Client
  ) {
    this.factory = factory;
    this.orderProtocol = orderProtocol;
    this.owner = ownerAddress;
    this.ownerWallet = Wallet.fromSeed(ownerSecret);
    this.client = client;
  }

  async connect(): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
    }
  }

  // Deploy source escrow with partial fill support
  async deploySrcCompactPartial(
    immutables: XRPLImmutables,
    order: XRPLHTLCOrder,
    partialAmount: string,
    safetyDepositAmount: string
  ): Promise<{
    success: boolean;
    escrowAddress?: string;
    txHash?: string;
    error?: string;
  }> {
    try {
      console.log("[XRPLUniteResolver] Deploying source escrow");
      console.log(`[XRPLUniteResolver] Order hash: ${order.orderHash}`);
      console.log(`[XRPLUniteResolver] Partial amount: ${partialAmount}`);
      
      // Check if this is the first fill for this order
      const existingEscrowAddress = this.orderProtocol.getEscrowAddress(order.orderHash);
      
      if (existingEscrowAddress) {
        console.log(`[XRPLUniteResolver] Using existing escrow: ${existingEscrowAddress}`);
        
        // For subsequent fills, add to existing escrow
        const result = await this.factory.createSrcEscrowPartial(
          order,
          this.owner,
          this.ownerWallet.seed!,
          partialAmount,
          safetyDepositAmount,
          immutables.hashlock
        );
        
        if (result.success) {
          // Update fill amount in order protocol
          this.orderProtocol.addPartialFill(order.orderHash, partialAmount);
          
          return {
            success: true,
            escrowAddress: existingEscrowAddress,
            txHash: result.txHash,
          };
        } else {
          return {
            success: false,
            error: result.error || "Unknown error",
          };
        }
      } else {
        // First resolver - create new escrow
        const result = await this.factory.createSrcEscrowPartial(
          order,
          this.owner,
          this.ownerWallet.seed!,
          partialAmount,
          safetyDepositAmount,
          immutables.hashlock
        );
        
        if (result.success && result.escrowDetails) {
          // Store escrow address in order protocol
          const escrowAddress = `${result.escrowDetails.escrowCreator}:${result.escrowDetails.sequence}`;
          this.orderProtocol.setEscrowAddress(order.orderHash, escrowAddress);
          
          // Update fill amount
          this.orderProtocol.addPartialFill(order.orderHash, partialAmount);
          
          console.log(`[XRPLUniteResolver] Created new escrow: ${escrowAddress}`);
          
          return {
            success: true,
            escrowAddress: escrowAddress,
            txHash: result.txHash,
          };
        } else {
          return {
            success: false,
            error: result.error || "Unknown error",
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Deploy destination escrow with partial fill support
  async deployDstPartial(
    immutables: XRPLImmutables,
    srcCancellationTimestamp: number,
    partialAmount: string,
    safetyDepositAmount: string
  ): Promise<{
    success: boolean;
    escrowAddress?: string;
    txHash?: string;
    error?: string;
  }> {
    try {
      const order = this.orderProtocol.getOrder(immutables.orderHash);
      if (!order) {
        return {
          success: false,
          error: "Order not found",
        };
      }

      const result = await this.factory.createDstEscrowPartial(
        order,
        this.owner,
        this.ownerWallet.seed!,
        partialAmount,
        safetyDepositAmount,
        immutables.hashlock
      );
      
      if (result.success && result.escrowDetails) {
        const escrowAddress = `${result.escrowDetails.escrowCreator}:${result.escrowDetails.sequence}`;
        
        return {
          success: true,
          escrowAddress: escrowAddress,
          txHash: result.txHash,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Fill order with Dutch auction pricing
  async fillOrder(
    immutables: XRPLImmutables,
    order: XRPLHTLCOrder,
    srcCancellationTimestamp: number,
    srcAmount: string,
    safetyDepositAmount: string
  ): Promise<{
    success: boolean;
    escrowAddress?: string;
    txHash?: string;
    destAmount?: string;
    currentPrice?: string;
    error?: string;
  }> {
    try {
      if (srcAmount === "0") {
        return {
          success: false,
          error: "Invalid source amount",
        };
      }
      
      // Check if order is already completed
      if (this.orderProtocol.isOrderFullyFilled(order.orderHash)) {
        return {
          success: false,
          error: "Order already completed",
        };
      }
      
      // Check remaining amount
      const remainingAmount = this.orderProtocol.getRemainingAmount(order.orderHash);
      if (BigInt(srcAmount) > BigInt(remainingAmount)) {
        return {
          success: false,
          error: "Amount exceeds remaining",
        };
      }
      
      // Calculate destination amount based on current Dutch auction price
      const currentTime = Math.floor(Date.now() / 1000);
      const destAmount = DutchAuctionLib.calculateTakingAmount(
        srcAmount,
        order.startPrice,
        order.endPrice,
        order.auctionStartTime,
        order.auctionEndTime,
        currentTime
      );
      
      // Get current price for logging
      const currentPrice = DutchAuctionLib.getCurrentPrice(
        order.startPrice,
        order.endPrice,
        order.auctionStartTime,
        order.auctionEndTime,
        currentTime
      );
      
      console.log(`[XRPLUniteResolver] Filling order with Dutch auction`);
      console.log(`[XRPLUniteResolver] Source amount: ${srcAmount}`);
      console.log(`[XRPLUniteResolver] Dest amount: ${destAmount}`);
      console.log(`[XRPLUniteResolver] Current price: ${currentPrice}`);
      
      // Deploy destination escrow with calculated amount
      const result = await this.factory.createDstEscrowPartial(
        order,
        this.owner,
        this.ownerWallet.seed!,
        destAmount,
        safetyDepositAmount,
        immutables.hashlock
      );
      
      if (result.success && result.escrowDetails) {
        const escrowAddress = `${result.escrowDetails.escrowCreator}:${result.escrowDetails.sequence}`;
        
        // Update fill tracking in order protocol
        this.orderProtocol.updateFillAmount(order.orderHash, srcAmount);
        
        return {
          success: true,
          escrowAddress: escrowAddress,
          txHash: result.txHash,
          destAmount: destAmount,
          currentPrice: currentPrice,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Withdraw funds using secret
  async withdraw(
    escrowDetails: XRPLEscrowDetails,
    secret: string
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      const { fulfillment } = this.factory.generateHTLCCondition(secret);
      
      const result = await this.factory.fulfillEscrowWithSecret(
        escrowDetails,
        fulfillment,
        this.owner,
        this.ownerWallet.seed!
      );
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Cancel escrow
  async cancel(
    escrowDetails: XRPLEscrowDetails
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      const result = await this.factory.cancelEscrow(
        escrowDetails,
        this.owner,
        this.ownerWallet.seed!
      );
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Pre-approve tokens (not applicable for XRP, but included for interface compatibility)
  async approveToken(token: string, amount: string): Promise<void> {
    console.log("[XRPLUniteResolver] Token approval not required for XRP");
  }

  // Execute arbitrary operations (for owner only)
  async arbitraryCall(
    operation: () => Promise<any>
  ): Promise<any> {
    // This would need proper access control in production
    return await operation();
  }
}