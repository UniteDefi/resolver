export interface XRPLHTLCOrder {
  orderHash: string;
  maker: string; // User creating the order
  taker?: string; // Optional specific taker
  makerAsset: string; // Token address on source chain
  takerAsset: string; // "XRP" for XRP Ledger
  makingAmount: string; // Amount in source chain units
  takingAmount: string; // Amount in XRP drops
  deadline: number;
  srcChainId: number;
  dstChainId: number; // XRPL identifier
  hashlock: string;
  auctionStartTime?: number;
  auctionEndTime?: number;
  startPrice?: string;
  endPrice?: string;
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
  finishAfter?: number;
  cancelAfter?: number;
  fulfilled?: boolean;
  cancelled?: boolean;
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
