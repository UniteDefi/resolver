import { Address, Assets, Credential, Data, Lucid, UTxO, TxHash } from "lucid-cardano";

// Cross-chain order types
export interface CrossChainOrder {
  orderHash: string;
  maker: Address;
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  amount: bigint;
  expectedAmount: bigint;
  deadline: number;
  nonce: number;
  signature?: string;
}

// Escrow data types
export interface EscrowData {
  orderHash: string;
  hashlock: string;
  maker: string;
  taker: string;
  resolver: string;
  tokenPolicy: string;
  tokenName: string;
  amount: bigint;
  partialAmount: bigint;
  safetyDeposit: bigint;
  srcCancellationTimestamp: number;
  timelockStart: number;
  timelockDuration: number;
  isSource: boolean;
  state: EscrowState;
}

export enum EscrowState {
  Active = "Active",
  Withdrawn = "Withdrawn", 
  Cancelled = "Cancelled"
}

// Redeemer types
export type EscrowRedeemer = 
  | { type: "WithdrawWithSecret"; secret: string }
  | { type: "Cancel" }
  | { type: "AddResolver"; resolver: string; partialAmount: bigint };

export type FactoryRedeemer =
  | { type: "CreateEscrow"; orderHash: string; isSource: boolean; initialResolver: string; partialAmount: bigint }
  | { type: "UpdateAdmin"; newAdmin: string };

export type ResolverRedeemer =
  | { type: "CommitToOrder"; orderHash: string; partialAmount: bigint; safetyDeposit: bigint }
  | { type: "WithdrawEarnings" }
  | { type: "UpdateCommitment"; orderHash: string; newAmount: bigint };

// Factory data
export interface FactoryData {
  escrowCount: number;
  totalVolume: bigint;
  admin: string;
}

// Resolver data
export interface ResolverData {
  resolver: string;
  totalCommitted: bigint;
  totalEarned: bigint;
  activeOrders: string[];
}

// Transaction building types
export interface EscrowTxParams {
  escrowUtxo: UTxO;
  datum: EscrowData;
  redeemer: EscrowRedeemer;
  signers: string[];
}

export interface CreateEscrowParams {
  order: CrossChainOrder;
  isSource: boolean;
  resolver: string;
  partialAmount: bigint;
  safetyDeposit: bigint;
  secret?: string;
  hashlock?: string;
}

// Deployment configuration
export interface CardanoDeployment {
  network: "testnet" | "mainnet";
  escrowValidator: {
    address: Address;
    scriptHash: string;
    compiledCode: string;
  };
  factoryValidator: {
    address: Address;
    scriptHash: string;
    compiledCode: string;
  };
  resolverValidator: {
    address: Address;
    scriptHash: string;
    compiledCode: string;
  };
}

// Constants
export const TIMELOCK_CONSTANTS = {
  SRC_WITHDRAWAL_TIME: 0,
  SRC_PUBLIC_WITHDRAWAL_TIME: 900,
  SRC_CANCELLATION_TIME: 1800,
  SRC_PUBLIC_CANCELLATION_TIME: 3600,
  DST_WITHDRAWAL_TIME: 0,
  DST_PUBLIC_WITHDRAWAL_TIME: 900,
  DST_CANCELLATION_TIME: 2700,
};

export const FEE_CONSTANTS = {
  RESOLVER_FEE_BASIS_POINTS: 10,
  SAFETY_DEPOSIT_BASIS_POINTS: 100,
  CALLER_REWARD_PERCENTAGE: 10,
};
