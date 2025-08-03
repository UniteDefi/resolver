export interface XRPLHTLCOrder {
  orderHash: string;
  salt: string; // Random salt for order uniqueness
  maker: string; // User creating the order
  receiver: string | undefined; // Optional receiver address (if different from maker)
  taker: string | undefined; // Optional specific taker (deprecated, use receiver)
  makerAsset: string; // Token address on source chain
  takerAsset: string; // "XRP" for XRP Ledger
  makingAmount: string; // Amount in source chain units
  takingAmount: string; // Amount in XRP drops
  deadline: number;
  nonce: number; // User nonce for replay protection
  srcChainId: number;
  dstChainId: number; // XRPL identifier
  hashlock: string;
  auctionStartTime: number; // Dutch auction start time
  auctionEndTime: number; // Dutch auction end time
  startPrice: string; // Starting price (higher) in 18 decimal precision
  endPrice: string; // Ending price (lower) in 18 decimal precision
}

export interface XRPLEscrowDetails {
  orderHash: string;
  escrowCreator: string;
  destination: string;
  amount: string; // Total amount in drops
  partialAmount: string; // Partial amount for this resolver
  safetyDeposit: string; // Safety deposit amount
  condition: string;
  txHash: string;
  sequence: number;
  isSource: boolean; // true if source chain escrow, false if destination
  finishAfter: number | undefined;
  cancelAfter: number | undefined;
  fulfilled: boolean | undefined;
  cancelled: boolean | undefined;
}

export interface XRPLResolverCommitment {
  resolver: string;
  partialAmount: string;
  safetyDeposit: string;
  escrowTxHash: string;
  escrowSequence: number;
}

export interface XRPLTransactionResult {
  success: boolean;
  txHash?: string;
  sequence?: number;
  error?: string;
  escrowDetails?: XRPLEscrowDetails;
}
