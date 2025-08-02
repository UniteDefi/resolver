export interface EVMOrderDetails {
  orderHash: string;
  maker: string;
  taker?: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  deadline: number;
  srcChainId: number;
  dstChainId: number;
  signature?: string;
}

export interface ResolverConfig {
  address: string;
  secret: string;
  name?: string;
  maxCommitmentXRP?: string;
  safetyDepositRatio?: number; // Percentage of commitment as safety deposit
}

export interface ResolverAllocation {
  resolverAddress: string;
  xrpAmount: string; // Amount this resolver commits (in XRP)
  safetyDeposit: string; // Safety deposit for this resolver (in XRP)
}

export interface CrossChainSwapConfig {
  evmOrderDetails: EVMOrderDetails;
  hashlock: string;
  swapDirection: "EVM_TO_XRPL" | "XRPL_TO_EVM";
  totalXRPAmount: string; // Total XRP amount for the swap
  resolverAllocations: ResolverAllocation[];
}
