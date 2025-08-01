import { Client, Wallet, EscrowCreate, EscrowFinish, EscrowCancel } from "xrpl";
import { EscrowConfig, EscrowDetails, TransactionResult } from "./types";
import crypto from "crypto";

export class XRPEscrow {
  private client: Client;

  constructor(serverUrl: string = "wss://s.altnet.rippletest.net:51233") {
    this.client = new Client(serverUrl);
  }

  async connect(): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
      console.log("[XRPEscrow] Connected to XRP Ledger");
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isConnected()) {
      await this.client.disconnect();
      console.log("[XRPEscrow] Disconnected from XRP Ledger");
    }
  }

  generateConditionAndFulfillment(): { condition: string; fulfillment: string } {
    // Generate a random preimage
    const preimage = crypto.randomBytes(32);
    const fulfillment = preimage.toString("hex").toUpperCase();
    
    // Generate condition from preimage (SHA-256)
    const hash = crypto.createHash("sha256");
    hash.update(preimage);
    const condition = hash.digest("hex").toUpperCase();
    
    // Create crypto-condition in the format XRPL expects
    const conditionFormatted = `A0258020${condition}810103`;
    
    return {
      condition: conditionFormatted,
      fulfillment: `A0220020${fulfillment}`,
    };
  }

  async createEscrow(config: EscrowConfig): Promise<TransactionResult> {
    try {
      await this.connect();
      
      const wallet = Wallet.fromSeed(config.sourceSecret);
      console.log("[XRPEscrow] Wallet address from secret:", wallet.address);
      console.log("[XRPEscrow] Expected address:", config.sourceAddress);
      
      // Check source balance first
      const sourceBalance = await this.client.getXrpBalance(wallet.address);
      console.log("[XRPEscrow] Source balance:", sourceBalance, "XRP");
      
      const escrowTx: EscrowCreate = {
        TransactionType: "EscrowCreate",
        Account: wallet.address,
        Destination: config.destinationAddress,
        Amount: config.amount,
      };

      if (config.condition) {
        escrowTx.Condition = config.condition;
      }

      if (config.finishAfter) {
        // Convert Unix timestamp to Ripple timestamp (seconds since Ripple epoch)
        escrowTx.FinishAfter = config.finishAfter - 946684800;
      }

      if (config.cancelAfter) {
        // Convert Unix timestamp to Ripple timestamp
        escrowTx.CancelAfter = config.cancelAfter - 946684800;
      }

      console.log("[XRPEscrow] Creating escrow:", escrowTx);

      const prepared = await this.client.autofill(escrowTx);
      const signed = wallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta && typeof result.result.meta !== "string" && 
          result.result.meta.TransactionResult === "tesSUCCESS") {
        console.log("[XRPEscrow] Escrow created successfully");
        
        return {
          success: true,
          txHash: result.result.hash,
          ledgerIndex: result.result.ledger_index,
        };
      } else {
        const error = result.result.meta && typeof result.result.meta !== "string" 
          ? result.result.meta.TransactionResult 
          : JSON.stringify(result.result);
        return {
          success: false,
          error: `Transaction failed: ${error}`,
        };
      }
    } catch (error) {
      console.error("[XRPEscrow] Error creating escrow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async fulfillEscrow(
    sourceAddress: string,
    sourceSecret: string,
    escrowCreator: string,
    escrowSequence: number,
    fulfillment?: string
  ): Promise<TransactionResult> {
    try {
      await this.connect();
      
      const wallet = Wallet.fromSeed(sourceSecret);
      
      const finishTx: EscrowFinish = {
        TransactionType: "EscrowFinish",
        Account: sourceAddress,
        Owner: escrowCreator,
        OfferSequence: escrowSequence,
      };

      if (fulfillment) {
        finishTx.Fulfillment = fulfillment;
      }

      console.log("[XRPEscrow] Fulfilling escrow:", finishTx);

      const prepared = await this.client.autofill(finishTx);
      const signed = wallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta && typeof result.result.meta !== "string" && 
          result.result.meta.TransactionResult === "tesSUCCESS") {
        console.log("[XRPEscrow] Escrow fulfilled successfully");
        
        return {
          success: true,
          txHash: result.result.hash,
          ledgerIndex: result.result.ledger_index,
        };
      } else {
        return {
          success: false,
          error: `Transaction failed: ${result.result.meta}`,
        };
      }
    } catch (error) {
      console.error("[XRPEscrow] Error fulfilling escrow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async cancelEscrow(
    sourceAddress: string,
    sourceSecret: string,
    escrowCreator: string,
    escrowSequence: number
  ): Promise<TransactionResult> {
    try {
      await this.connect();
      
      const wallet = Wallet.fromSeed(sourceSecret);
      
      const cancelTx: EscrowCancel = {
        TransactionType: "EscrowCancel",
        Account: sourceAddress,
        Owner: escrowCreator,
        OfferSequence: escrowSequence,
      };

      console.log("[XRPEscrow] Cancelling escrow:", cancelTx);

      const prepared = await this.client.autofill(cancelTx);
      const signed = wallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta && typeof result.result.meta !== "string" && 
          result.result.meta.TransactionResult === "tesSUCCESS") {
        console.log("[XRPEscrow] Escrow cancelled successfully");
        
        return {
          success: true,
          txHash: result.result.hash,
          ledgerIndex: result.result.ledger_index,
        };
      } else {
        return {
          success: false,
          error: `Transaction failed: ${result.result.meta}`,
        };
      }
    } catch (error) {
      console.error("[XRPEscrow] Error cancelling escrow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getEscrows(address: string): Promise<EscrowDetails[]> {
    try {
      await this.connect();
      
      const response = await this.client.request({
        command: "account_objects",
        account: address,
        type: "escrow",
      });

      if (response.result.account_objects) {
        return response.result.account_objects.map((escrow: any) => ({
          account: escrow.Account,
          destination: escrow.Destination,
          amount: escrow.Amount,
          condition: escrow.Condition,
          cancelAfter: escrow.CancelAfter,
          finishAfter: escrow.FinishAfter,
          previousTxnID: escrow.PreviousTxnID,
          previousTxnLgrSeq: escrow.PreviousTxnLgrSeq,
          ownerNode: escrow.OwnerNode,
          escrowIndex: escrow.index,
        }));
      }

      return [];
    } catch (error) {
      console.error("[XRPEscrow] Error getting escrows:", error);
      return [];
    }
  }
}