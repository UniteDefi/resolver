import { connect, keyStores, utils, Contract } from "near-api-js";
import { NEAR_CONFIG } from "../config";

export class NearHelper {
  private near: any;
  private account: any;
  
  constructor(private accountId: string, private privateKey: string) {}
  
  async init() {
    console.log("[NearHelper] Initializing Near connection...");
    const keyStore = new keyStores.InMemoryKeyStore();
    const keyPair = utils.KeyPair.fromString(this.privateKey);
    await keyStore.setKey(NEAR_CONFIG.networkId, this.accountId, keyPair);
    
    this.near = await connect({
      ...NEAR_CONFIG,
      keyStore,
    });
    
    this.account = await this.near.account(this.accountId);
    console.log("[NearHelper] Connected to account:", this.accountId);
  }
  
  async createHTLC(
    contractId: string,
    recipient: string,
    token: string | null,
    amount: string,
    hashlock: string,
    timelock: number
  ): Promise<string> {
    console.log("[NearHelper] Creating HTLC...");
    
    const args = {
      recipient,
      token,
      amount,
      hashlock,
      timelock,
    };
    
    const result = await this.account.functionCall({
      contractId,
      methodName: "create_htlc",
      args,
      gas: "300000000000000",
      attachedDeposit: token ? "1" : amount, // Attach NEAR if no token
    });
    
    console.log("[NearHelper] HTLC created, tx hash:", result.transaction.hash);
    
    // Extract HTLC ID from logs
    const htlcId = this.extractHTLCIdFromLogs(result);
    return htlcId;
  }
  
  async withdrawHTLC(
    contractId: string,
    htlcId: string,
    secret: string
  ): Promise<void> {
    console.log("[NearHelper] Withdrawing HTLC...");
    
    const result = await this.account.functionCall({
      contractId,
      methodName: "withdraw",
      args: {
        htlc_id: htlcId,
        secret,
      },
      gas: "300000000000000",
    });
    
    console.log("[NearHelper] HTLC withdrawn, tx hash:", result.transaction.hash);
  }
  
  async cancelHTLC(contractId: string, htlcId: string): Promise<void> {
    console.log("[NearHelper] Cancelling HTLC...");
    
    const result = await this.account.functionCall({
      contractId,
      methodName: "cancel",
      args: {
        htlc_id: htlcId,
      },
      gas: "300000000000000",
    });
    
    console.log("[NearHelper] HTLC cancelled, tx hash:", result.transaction.hash);
  }
  
  async getHTLC(contractId: string, htlcId: string): Promise<any> {
    try {
      const result = await this.account.viewFunction({
        contractId,
        methodName: "get_htlc",
        args: { htlc_id: htlcId },
      });
      return result;
    } catch (error) {
      console.log("[NearHelper] Error getting HTLC:", error);
      return null;
    }
  }
  
  async createAuction(
    contractId: string,
    startPrice: string,
    reservePrice: string,
    declinePerBlock: string,
    htlcHashlock: string,
    htlcTimelock: number,
    htlcCounterparty: string
  ): Promise<string> {
    console.log("[NearHelper] Creating auction...");
    
    const result = await this.account.functionCall({
      contractId,
      methodName: "create_auction",
      args: {
        start_price: startPrice,
        reserve_price: reservePrice,
        decline_per_block: declinePerBlock,
        htlc_hashlock: htlcHashlock,
        htlc_timelock: htlcTimelock,
        htlc_counterparty: htlcCounterparty,
      },
      gas: "300000000000000",
      attachedDeposit: "1",
    });
    
    console.log("[NearHelper] Auction created, tx hash:", result.transaction.hash);
    
    // Extract auction ID from logs
    const auctionId = this.extractAuctionIdFromLogs(result);
    return auctionId;
  }
  
  async settleAuction(
    contractId: string,
    auctionId: string,
    price: string
  ): Promise<void> {
    console.log("[NearHelper] Settling auction...");
    
    const result = await this.account.functionCall({
      contractId,
      methodName: "settle_auction",
      args: {
        auction_id: auctionId,
      },
      gas: "300000000000000",
      attachedDeposit: price,
    });
    
    console.log("[NearHelper] Auction settled, tx hash:", result.transaction.hash);
  }
  
  private extractHTLCIdFromLogs(result: any): string {
    // Parse logs to extract HTLC ID
    // This is a simplified version - actual implementation would parse EVENT_JSON logs
    const logs = result.receipts_outcome[0].outcome.logs;
    for (const log of logs) {
      if (log.includes("HTLCCreated")) {
        // Extract htlc_id from the log
        const match = log.match(/"htlc_id":"([^"]+)"/);
        if (match) return match[1];
      }
    }
    return "htlc_" + Date.now(); // Fallback
  }
  
  private extractAuctionIdFromLogs(result: any): string {
    // Parse logs to extract auction ID
    const logs = result.receipts_outcome[0].outcome.logs;
    for (const log of logs) {
      if (log.includes("AuctionCreated")) {
        const match = log.match(/"auction_id":"([^"]+)"/);
        if (match) return match[1];
      }
    }
    return "auction_" + Date.now(); // Fallback
  }
  
  async waitForTransaction(txHash: string): Promise<any> {
    console.log("[NearHelper] Waiting for transaction:", txHash);
    const result = await this.near.connection.provider.txStatus(
      txHash,
      this.accountId
    );
    return result;
  }
}