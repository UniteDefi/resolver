import { Address, Data, Lucid, fromText, toHex, C } from "lucid-cardano";
import { EscrowData, EscrowState, EscrowRedeemer, FactoryData, ResolverData } from "../types/cardano";
import crypto from "crypto";

// Data encoding/decoding functions
export const EscrowDatumSchema = Data.Object({
  orderHash: Data.Bytes(),
  hashlock: Data.Bytes(),
  maker: Data.Bytes(),
  taker: Data.Bytes(),
  resolver: Data.Bytes(),
  tokenPolicy: Data.Bytes(),
  tokenName: Data.Bytes(),
  amount: Data.Integer(),
  partialAmount: Data.Integer(),
  safetyDeposit: Data.Integer(),
  srcCancellationTimestamp: Data.Integer(),
  timelockStart: Data.Integer(),
  timelockDuration: Data.Integer(),
  isSource: Data.Boolean(),
  state: Data.Enum([
    Data.Literal("Active"),
    Data.Literal("Withdrawn"),
    Data.Literal("Cancelled")
  ])
});

export const EscrowRedeemerSchema = Data.Enum([
  Data.Object({
    WithdrawWithSecret: Data.Object({
      secret: Data.Bytes()
    })
  }),
  Data.Literal("Cancel"),
  Data.Object({
    AddResolver: Data.Object({
      resolver: Data.Bytes(),
      partialAmount: Data.Integer()
    })
  })
]);

export const FactoryDatumSchema = Data.Object({
  escrowCount: Data.Integer(),
  totalVolume: Data.Integer(),
  admin: Data.Bytes()
});

export const ResolverDatumSchema = Data.Object({
  resolver: Data.Bytes(),
  totalCommitted: Data.Integer(),
  totalEarned: Data.Integer(),
  activeOrders: Data.Array(Data.Bytes())
});

// Utility functions
export function generateSecret(): string {
  return toHex(crypto.randomBytes(32));
}

export function generateHashlock(secret: string): string {
  const secretBytes = Buffer.from(secret, 'hex');
  const hash = crypto.createHash('sha256').update(secretBytes).digest();
  return toHex(hash);
}

export function calculateSafetyDeposit(amount: bigint): bigint {
  return (amount * BigInt(100)) / BigInt(10000); // 1%
}

export function calculateResolverFee(amount: bigint): bigint {
  return (amount * BigInt(10)) / BigInt(10000); // 0.1%
}

export function calculateProportionalAmount(
  totalAmount: bigint,
  partialAmount: bigint,
  targetAmount: bigint
): bigint {
  return (targetAmount * partialAmount) / totalAmount;
}

export function getCurrentTimeSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function addressToBytes(address: Address): string {
  // Convert Cardano address to bytes representation
  const addressBytes = C.Address.from_bech32(address).to_bytes();
  return toHex(addressBytes);
}

export function bytesToAddress(bytes: string, lucid: Lucid): Address {
  // Convert bytes back to Cardano address
  const addressBytes = Buffer.from(bytes, 'hex');
  const address = C.Address.from_bytes(addressBytes);
  return address.to_bech32();
}

export function createOrderHash(
  salt: number,
  maker: string,
  srcChainId: number,
  dstChainId: number,
  srcToken: string,
  dstToken: string,
  amount: bigint,
  expectedAmount: bigint,
  deadline: number,
  nonce: number
): string {
  // Create a deterministic hash for the order
  const orderData = `${salt}-${maker}-${srcChainId}-${dstChainId}-${srcToken}-${dstToken}-${amount}-${expectedAmount}-${deadline}-${nonce}`;
  return crypto.createHash('sha256').update(orderData).digest('hex');
}

export function encodeEscrowDatum(data: EscrowData): string {
  const datum = {
    orderHash: data.orderHash,
    hashlock: data.hashlock,
    maker: data.maker,
    taker: data.taker,
    resolver: data.resolver,
    tokenPolicy: data.tokenPolicy,
    tokenName: data.tokenName,
    amount: data.amount,
    partialAmount: data.partialAmount,
    safetyDeposit: data.safetyDeposit,
    srcCancellationTimestamp: BigInt(data.srcCancellationTimestamp),
    timelockStart: BigInt(data.timelockStart),
    timelockDuration: BigInt(data.timelockDuration),
    isSource: data.isSource,
    state: data.state
  };
  
  return Data.to(datum, EscrowDatumSchema);
}

export function decodeEscrowDatum(datumCbor: string): EscrowData {
  const datum = Data.from(datumCbor, EscrowDatumSchema);
  
  return {
    orderHash: datum.orderHash,
    hashlock: datum.hashlock,
    maker: datum.maker,
    taker: datum.taker,
    resolver: datum.resolver,
    tokenPolicy: datum.tokenPolicy,
    tokenName: datum.tokenName,
    amount: datum.amount,
    partialAmount: datum.partialAmount,
    safetyDeposit: datum.safetyDeposit,
    srcCancellationTimestamp: Number(datum.srcCancellationTimestamp),
    timelockStart: Number(datum.timelockStart),
    timelockDuration: Number(datum.timelockDuration),
    isSource: datum.isSource,
    state: datum.state as EscrowState
  };
}

export function encodeEscrowRedeemer(redeemer: EscrowRedeemer): string {
  let redeemerData;
  
  switch (redeemer.type) {
    case "WithdrawWithSecret":
      redeemerData = {
        WithdrawWithSecret: {
          secret: redeemer.secret
        }
      };
      break;
    case "Cancel":
      redeemerData = "Cancel";
      break;
    case "AddResolver":
      redeemerData = {
        AddResolver: {
          resolver: redeemer.resolver,
          partialAmount: redeemer.partialAmount
        }
      };
      break;
  }
  
  return Data.to(redeemerData, EscrowRedeemerSchema);
}

export function validateTimelock(
  startTime: number,
  duration: number,
  currentTime: number
): boolean {
  return currentTime >= startTime && currentTime <= startTime + duration;
}

export function canCancel(
  startTime: number,
  cancellationTime: number,
  currentTime: number,
  isMaker: boolean,
  isPublic: boolean
): boolean {
  const cancellationStart = startTime + cancellationTime;
  
  if (isPublic) {
    return currentTime >= cancellationStart + 3600; // 1 hour for public cancellation
  } else if (isMaker) {
    return currentTime >= cancellationStart;
  } else {
    return false;
  }
}

// Asset helper functions
export function createAssets(policyId: string, tokenName: string, amount: bigint): Assets {
  if (policyId === "" && tokenName === "") {
    // ADA
    return { lovelace: amount };
  } else {
    // Native token
    return {
      [policyId + fromText(tokenName)]: amount
    };
  }
}

export function getAssetAmount(assets: Assets, policyId: string, tokenName: string): bigint {
  if (policyId === "" && tokenName === "") {
    return assets.lovelace || BigInt(0);
  } else {
    const assetId = policyId + fromText(tokenName);
    return assets[assetId] || BigInt(0);
  }
}
