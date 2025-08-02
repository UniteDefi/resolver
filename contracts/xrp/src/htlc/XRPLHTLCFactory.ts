import { Client, Wallet, xrpToDrops, dropsToXrp, EscrowCreate, EscrowFinish, EscrowCancel } from "xrpl";
import crypto from "crypto";
import { XRPLHTLCOrder, XRPLEscrowDetails, XRPLTransactionResult, XRPLResolverCommitment } from "./types";

export class XRPLHTLCFactory {
  private client: Client;
  private escrows: Map<string, XRPLEscrowDetails[]> = new Map(); // orderHash -> escrows
  private resolverCommitments: Map<string, XRPLResolverCommitment[]> = new Map(); // orderHash -> commitments
  
  constructor(serverUrl: string = "wss://s.altnet.rippletest.net:51233") {
    this.client = new Client(serverUrl);
  }

  async connect(): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
      console.log("[XRPLHTLCFactory] Connected to XRP Ledger");
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isConnected()) {
      await this.client.disconnect();
      console.log("[XRPLHTLCFactory] Disconnected from XRP Ledger");
    }
  }

  generateHTLCCondition(secret: string): { condition: string; fulfillment: string } {
    const secretBytes = Buffer.from(secret.replace('0x', ''), 'hex');
    const hash = crypto.createHash("sha256").update(secretBytes).digest();
    
    // XRPL condition format: A0258020 + hash + 810103
    const condition = `A0258020${hash.toString('hex').toUpperCase()}810103`;
    const fulfillment = `A0220020${secretBytes.toString('hex').toUpperCase()}`;
    
    return { condition, fulfillment };
  }

  async createSrcEscrowPartial(
    order: XRPLHTLCOrder,
    resolverAddress: string,
    resolverSecret: string,
    partialAmount: string,
    safetyDeposit: string,
    hashlock: string
  ): Promise<XRPLTransactionResult> {
    try {
      await this.connect();
      
      const resolver = Wallet.fromSeed(resolverSecret);
      const { condition } = this.generateHTLCCondition(hashlock);
      
      // Create escrow for partial amount + safety deposit
      const totalAmount = xrpToDrops((parseFloat(dropsToXrp(partialAmount)) + parseFloat(dropsToXrp(safetyDeposit))).toString());
      
      const escrowTx: EscrowCreate = {
        TransactionType: "EscrowCreate",
        Account: resolver.address,
        Destination: order.maker, // User receives XRP when fulfilled
        Amount: totalAmount,
        Condition: condition,
        FinishAfter: Math.floor(Date.now() / 1000) + 60 - 946684800, // 1 minute from now
        CancelAfter: Math.floor(Date.now() / 1000) + 3600 - 946684800, // 1 hour for cancellation
      };

      console.log(`[XRPLHTLCFactory] Creating source escrow for resolver ${resolverAddress}`);
      console.log(`[XRPLHTLCFactory] Partial amount: ${dropsToXrp(partialAmount)} XRP`);
      console.log(`[XRPLHTLCFactory] Safety deposit: ${dropsToXrp(safetyDeposit)} XRP`);
      
      const prepared = await this.client.autofill(escrowTx);
      const signed = resolver.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta && typeof result.result.meta !== "string" && 
          result.result.meta.TransactionResult === "tesSUCCESS") {
        
        // Store escrow details
        const escrowDetails: XRPLEscrowDetails = {
          orderHash: order.orderHash,
          escrowCreator: resolver.address,
          destination: order.maker,
          amount: totalAmount,
          partialAmount: partialAmount,
          safetyDeposit: safetyDeposit,
          condition: condition,
          txHash: result.result.hash!,
          sequence: result.result.Sequence!,
          isSource: true,
          finishAfter: escrowTx.FinishAfter,
          cancelAfter: escrowTx.CancelAfter,
        };
        
        if (!this.escrows.has(order.orderHash)) {
          this.escrows.set(order.orderHash, []);
        }
        this.escrows.get(order.orderHash)!.push(escrowDetails);
        
        // Store resolver commitment
        const commitment: XRPLResolverCommitment = {
          resolver: resolverAddress,
          partialAmount: partialAmount,
          safetyDeposit: safetyDeposit,
          escrowTxHash: result.result.hash!,
          escrowSequence: result.result.Sequence!,
        };
        
        if (!this.resolverCommitments.has(order.orderHash)) {
          this.resolverCommitments.set(order.orderHash, []);
        }
        this.resolverCommitments.get(order.orderHash)!.push(commitment);
        
        console.log(`[XRPLHTLCFactory] ✅ Source escrow created: ${result.result.hash}`);
        
        return {
          success: true,
          txHash: result.result.hash!,
          sequence: result.result.Sequence!,
          escrowDetails,
        };
      } else {
        return {
          success: false,
          error: `Transaction failed: ${result.result.meta}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async createDstEscrowPartial(
    order: XRPLHTLCOrder,
    resolverAddress: string,
    resolverSecret: string,
    partialAmount: string,
    safetyDeposit: string,
    hashlock: string
  ): Promise<XRPLTransactionResult> {
    try {
      await this.connect();
      
      const resolver = Wallet.fromSeed(resolverSecret);
      const { condition } = this.generateHTLCCondition(hashlock);
      
      // Create escrow for partial amount only (user funded, resolver adds safety deposit)
      const escrowTx: EscrowCreate = {
        TransactionType: "EscrowCreate",
        Account: resolver.address,
        Destination: order.taker || order.maker, // Destination chain recipient
        Amount: partialAmount, // Only partial amount, safety deposit handled separately
        Condition: condition,
        FinishAfter: Math.floor(Date.now() / 1000) + 30 - 946684800, // 30 seconds (less than source)
        CancelAfter: Math.floor(Date.now() / 1000) + 2700 - 946684800, // 45 minutes
      };

      console.log(`[XRPLHTLCFactory] Creating destination escrow for resolver ${resolverAddress}`);
      console.log(`[XRPLHTLCFactory] Partial amount: ${dropsToXrp(partialAmount)} XRP`);
      
      const prepared = await this.client.autofill(escrowTx);
      const signed = resolver.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta && typeof result.result.meta !== "string" && 
          result.result.meta.TransactionResult === "tesSUCCESS") {
        
        const escrowDetails: XRPLEscrowDetails = {
          orderHash: order.orderHash,
          escrowCreator: resolver.address,
          destination: order.taker || order.maker,
          amount: partialAmount,
          partialAmount: partialAmount,
          safetyDeposit: safetyDeposit,
          condition: condition,
          txHash: result.result.hash!,
          sequence: result.result.Sequence!,
          isSource: false,
          finishAfter: escrowTx.FinishAfter,
          cancelAfter: escrowTx.CancelAfter,
        };
        
        if (!this.escrows.has(order.orderHash)) {
          this.escrows.set(order.orderHash, []);
        }
        this.escrows.get(order.orderHash)!.push(escrowDetails);
        
        console.log(`[XRPLHTLCFactory] ✅ Destination escrow created: ${result.result.hash}`);
        
        return {
          success: true,
          txHash: result.result.hash!,
          sequence: result.result.Sequence!,
          escrowDetails,
        };
      } else {
        return {
          success: false,
          error: `Transaction failed: ${result.result.meta}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async fulfillEscrowWithSecret(
    escrowDetails: XRPLEscrowDetails,
    fulfillment: string,
    fulfillerAddress: string,
    fulfillerSecret: string
  ): Promise<XRPLTransactionResult> {
    try {
      await this.connect();
      
      const fulfiller = Wallet.fromSeed(fulfillerSecret);
      
      const finishTx: EscrowFinish = {
        TransactionType: "EscrowFinish",
        Account: fulfiller.address,
        Owner: escrowDetails.escrowCreator,
        OfferSequence: escrowDetails.sequence,
        Fulfillment: fulfillment,
      };

      const prepared = await this.client.autofill(finishTx);
      const signed = fulfiller.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta && typeof result.result.meta !== "string" && 
          result.result.meta.TransactionResult === "tesSUCCESS") {
        
        console.log(`[XRPLHTLCFactory] ✅ Escrow fulfilled: ${result.result.hash}`);
        
        return {
          success: true,
          txHash: result.result.hash!,
        };
      } else {
        return {
          success: false,
          error: `Transaction failed: ${result.result.meta}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async cancelEscrow(
    escrowDetails: XRPLEscrowDetails,
    cancellerAddress: string,
    cancellerSecret: string
  ): Promise<XRPLTransactionResult> {
    try {
      await this.connect();
      
      const canceller = Wallet.fromSeed(cancellerSecret);
      
      const cancelTx: EscrowCancel = {
        TransactionType: "EscrowCancel",
        Account: canceller.address,
        Owner: escrowDetails.escrowCreator,
        OfferSequence: escrowDetails.sequence,
      };

      const prepared = await this.client.autofill(cancelTx);
      const signed = canceller.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta && typeof result.result.meta !== "string" && 
          result.result.meta.TransactionResult === "tesSUCCESS") {
        
        console.log(`[XRPLHTLCFactory] ✅ Escrow cancelled: ${result.result.hash}`);
        
        return {
          success: true,
          txHash: result.result.hash!,
        };
      } else {
        return {
          success: false,
          error: `Transaction failed: ${result.result.meta}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  getEscrows(orderHash: string): XRPLEscrowDetails[] {
    return this.escrows.get(orderHash) || [];
  }

  getResolverCommitments(orderHash: string): XRPLResolverCommitment[] {
    return this.resolverCommitments.get(orderHash) || [];
  }

  getTotalCommittedAmount(orderHash: string): string {
    const commitments = this.getResolverCommitments(orderHash);
    const total = commitments.reduce((sum, commitment) => {
      return sum + parseInt(commitment.partialAmount);
    }, 0);
    return total.toString();
  }
}
