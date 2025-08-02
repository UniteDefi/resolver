import { Wallet, xrpToDrops, dropsToXrp } from "xrpl";
import { XRPLHTLCFactory } from "../htlc/XRPLHTLCFactory";
import { XRPLOrderProtocol } from "../htlc/XRPLOrderProtocol";
import { XRPLHTLCOrder, XRPLEscrowDetails, XRPLTransactionResult } from "../htlc/types";
import { EVMOrderDetails, CrossChainSwapConfig } from "./types";

export class XRPLResolver {
  private htlcFactory: XRPLHTLCFactory;
  private orderProtocol: XRPLOrderProtocol;
  private resolverWallet: Wallet;
  private resolverAddress: string;

  constructor(
    resolverSecret: string,
    serverUrl?: string
  ) {
    this.htlcFactory = new XRPLHTLCFactory(serverUrl);
    this.orderProtocol = new XRPLOrderProtocol();
    this.resolverWallet = Wallet.fromSeed(resolverSecret);
    this.resolverAddress = this.resolverWallet.address;
    
    console.log(`[XRPLResolver] Initialized resolver: ${this.resolverAddress}`);
  }

  async connect(): Promise<void> {
    await this.htlcFactory.connect();
  }

  async disconnect(): Promise<void> {
    await this.htlcFactory.disconnect();
  }

  // Deploy source escrow (XRPL side) for EVM -> XRPL swap
  async deploySrcEscrowPartial(
    evmOrderDetails: EVMOrderDetails,
    partialXRPAmount: string, // In XRP (will be converted to drops)
    safetyDepositXRP: string, // In XRP
    hashlock: string
  ): Promise<XRPLTransactionResult> {
    try {
      // Convert EVM order to XRPL order format
      const xrplOrder: XRPLHTLCOrder = {
        orderHash: evmOrderDetails.orderHash,
        maker: evmOrderDetails.maker,
        taker: evmOrderDetails.taker,
        makerAsset: evmOrderDetails.makerAsset,
        takerAsset: "XRP",
        makingAmount: evmOrderDetails.makingAmount,
        takingAmount: evmOrderDetails.takingAmount, // Should be in drops
        deadline: evmOrderDetails.deadline,
        srcChainId: evmOrderDetails.srcChainId,
        dstChainId: 0, // XRPL
        hashlock: hashlock,
      };

      console.log("[XRPLResolver] Deploying source escrow for EVM -> XRPL swap");
      console.log(`[XRPLResolver] Partial XRP amount: ${partialXRPAmount} XRP`);
      console.log(`[XRPLResolver] Safety deposit: ${safetyDepositXRP} XRP`);

      const result = await this.htlcFactory.createSrcEscrowPartial(
        xrplOrder,
        this.resolverAddress,
        this.resolverWallet.seed!,
        xrpToDrops(partialXRPAmount),
        xrpToDrops(safetyDepositXRP),
        hashlock
      );

      if (result.success) {
        console.log(`[XRPLResolver] ✅ Source escrow deployed: ${result.txHash}`);
        
        // Record the partial fill in our order protocol
        this.orderProtocol.addPartialFill(xrplOrder.orderHash, xrpToDrops(partialXRPAmount));
      }

      return result;
    } catch (error) {
      console.error("[XRPLResolver] Error deploying source escrow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Deploy destination escrow (XRPL side) for XRPL -> EVM swap
  async deployDstEscrowPartial(
    evmOrderDetails: EVMOrderDetails,
    partialXRPAmount: string, // In XRP
    safetyDepositXRP: string, // In XRP
    hashlock: string
  ): Promise<XRPLTransactionResult> {
    try {
      const xrplOrder: XRPLHTLCOrder = {
        orderHash: evmOrderDetails.orderHash,
        maker: evmOrderDetails.maker,
        taker: evmOrderDetails.taker,
        makerAsset: "XRP",
        takerAsset: evmOrderDetails.takerAsset,
        makingAmount: evmOrderDetails.makingAmount, // XRP in drops
        takingAmount: evmOrderDetails.takingAmount, // EVM token amount
        deadline: evmOrderDetails.deadline,
        srcChainId: 0, // XRPL
        dstChainId: evmOrderDetails.dstChainId,
        hashlock: hashlock,
      };

      console.log("[XRPLResolver] Deploying destination escrow for XRPL -> EVM swap");
      console.log(`[XRPLResolver] Partial XRP amount: ${partialXRPAmount} XRP`);
      console.log(`[XRPLResolver] Safety deposit: ${safetyDepositXRP} XRP`);

      const result = await this.htlcFactory.createDstEscrowPartial(
        xrplOrder,
        this.resolverAddress,
        this.resolverWallet.seed!,
        xrpToDrops(partialXRPAmount),
        xrpToDrops(safetyDepositXRP),
        hashlock
      );

      if (result.success) {
        console.log(`[XRPLResolver] ✅ Destination escrow deployed: ${result.txHash}`);
      }

      return result;
    } catch (error) {
      console.error("[XRPLResolver] Error deploying destination escrow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Fulfill escrow with secret (used by user or after secret is revealed)
  async fulfillEscrow(
    escrowDetails: XRPLEscrowDetails,
    secret: string
  ): Promise<XRPLTransactionResult> {
    try {
      const { fulfillment } = this.htlcFactory.generateHTLCCondition(secret);
      
      console.log(`[XRPLResolver] Fulfilling escrow: ${escrowDetails.txHash}`);
      console.log(`[XRPLResolver] Amount: ${dropsToXrp(escrowDetails.amount)} XRP`);

      const result = await this.htlcFactory.fulfillEscrowWithSecret(
        escrowDetails,
        fulfillment,
        this.resolverAddress,
        this.resolverWallet.seed!
      );

      return result;
    } catch (error) {
      console.error("[XRPLResolver] Error fulfilling escrow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Cancel escrow (after timeout)
  async cancelEscrow(
    escrowDetails: XRPLEscrowDetails
  ): Promise<XRPLTransactionResult> {
    try {
      console.log(`[XRPLResolver] Cancelling escrow: ${escrowDetails.txHash}`);

      const result = await this.htlcFactory.cancelEscrow(
        escrowDetails,
        this.resolverAddress,
        this.resolverWallet.seed!
      );

      return result;
    } catch (error) {
      console.error("[XRPLResolver] Error cancelling escrow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Get resolver's escrows for a specific order
  getEscrows(orderHash: string): XRPLEscrowDetails[] {
    return this.htlcFactory.getEscrows(orderHash).filter(
      escrow => escrow.escrowCreator === this.resolverAddress
    );
  }

  // Get total committed amount for an order
  getTotalCommittedAmount(orderHash: string): string {
    return this.htlcFactory.getTotalCommittedAmount(orderHash);
  }

  // Check resolver balance
  async getBalance(): Promise<string> {
    await this.htlcFactory.connect();
    const balance = await this.htlcFactory["client"].getXrpBalance(this.resolverAddress);
    return balance;
  }

  // Get resolver address
  getAddress(): string {
    return this.resolverAddress;
  }
}
