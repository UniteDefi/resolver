export interface EscrowConfig {
  sourceAddress: string;
  sourceSecret: string;
  destinationAddress: string;
  amount: string; // Amount in drops (1 XRP = 1,000,000 drops)
  condition?: string; // Crypto condition for conditional escrow
  fulfillment?: string; // Fulfillment for the condition
  finishAfter?: number; // Unix timestamp after which escrow can be finished
  cancelAfter?: number; // Unix timestamp after which escrow can be cancelled
}

export interface EscrowDetails {
  account: string;
  destination: string;
  amount: string;
  condition?: string;
  cancelAfter?: number;
  finishAfter?: number;
  previousTxnID: string;
  previousTxnLgrSeq: number;
  ownerNode: string;
  escrowIndex?: number;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  ledgerIndex?: number;
  error?: string;
  escrowDetails?: EscrowDetails;
}