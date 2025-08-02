import { Address } from "@ton/core";
import { randomBytes, createHash } from "crypto";

export interface CrossChainOrder {
    orderHash: bigint;
    secret: bigint;
    hashlock: bigint;
    maker: Address;
    srcToken: Address | null; // null for TON
    dstToken: string; // EVM token address
    srcAmount: bigint;
    dstAmount: bigint;
    srcChainId: number;
    dstChainId: number;
    deadline: number;
    nonce: number;
}

export interface TimelockConfig {
    srcWithdrawal: number;
    srcPublicWithdrawal: number;
    srcCancellation: number;
    srcPublicCancellation: number;
    dstWithdrawal: number;
    dstPublicWithdrawal: number;
    dstCancellation: number;
}

export function generateSecret(): bigint {
    return BigInt("0x" + randomBytes(32).toString("hex"));
}

export function calculateHashlock(secret: bigint): bigint {
    const secretHex = secret.toString(16).padStart(64, "0");
    const hash = createHash("sha256").update(Buffer.from(secretHex, "hex")).digest();
    return BigInt("0x" + hash.toString("hex"));
}

export function createDefaultTimelocks(): TimelockConfig {
    return {
        srcWithdrawal: 0,           // No time limit for withdrawal with secret
        srcPublicWithdrawal: 900,   // 15 min for public reward
        srcCancellation: 1800,      // 30 min for cancellation
        srcPublicCancellation: 3600, // 1 hour for public cancellation
        dstWithdrawal: 0,           // No time limit for withdrawal with secret
        dstPublicWithdrawal: 900,   // 15 min for public reward
        dstCancellation: 2700       // 45 min for destination cancellation
    };
}

export function generateOrderHash(
    maker: Address,
    srcToken: Address | null,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    deadline: number,
    nonce: number
): bigint {
    const data = `${maker.toString()}-${srcToken?.toString() || 'TON'}-${dstToken}-${srcAmount}-${dstAmount}-${deadline}-${nonce}`;
    const hash = createHash("sha256").update(data).digest();
    return BigInt("0x" + hash.toString("hex"));
}

export interface SwapParams {
    secret: bigint;
    hashlock: bigint;
    orderHash: bigint;
    maker: Address;
    taker: Address;
    srcToken: Address | null;
    dstToken: string;
    srcAmount: bigint;
    dstAmount: bigint;
    deadline: number;
    nonce: number;
    timelocks: TimelockConfig;
    safetyDepositPerUnit: bigint;
}

export function createSwapParams(
    maker: Address,
    srcToken: Address | null,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    deadline: number,
    nonce: number,
    safetyDepositBasisPoints: number = 100 // 1% default
): SwapParams {
    const secret = generateSecret();
    const hashlock = calculateHashlock(secret);
    const orderHash = generateOrderHash(maker, srcToken, dstToken, srcAmount, dstAmount, deadline, nonce);
    const timelocks = createDefaultTimelocks();
    const safetyDepositPerUnit = (srcAmount * BigInt(safetyDepositBasisPoints)) / BigInt(10000);
    
    return {
        secret,
        hashlock,
        orderHash,
        maker,
        taker: Address.parse("0:0000000000000000000000000000000000000000000000000000000000000000"), // Multi-resolver
        srcToken,
        dstToken,
        srcAmount,
        dstAmount,
        deadline,
        nonce,
        timelocks,
        safetyDepositPerUnit
    };
}

export enum SwapState {
    Active = 0,
    Withdrawn = 1,
    Cancelled = 2
}

export interface ResolverCommitment {
    resolver: Address;
    partialAmount: bigint;
    safetyDeposit: bigint;
}

export function calculateProportionalAmounts(
    totalAmount: bigint,
    resolverCommitments: bigint[]
): ResolverCommitment[] {
    const totalCommitted = resolverCommitments.reduce((sum, amount) => sum + amount, 0n);
    
    if (totalCommitted !== totalAmount) {
        throw new Error(`Total committed ${totalCommitted} does not equal total amount ${totalAmount}`);
    }
    
    return resolverCommitments.map((amount, index) => ({
        resolver: Address.parse(`0:000000000000000000000000000000000000000000000000000000000000000${index}`),
        partialAmount: amount,
        safetyDeposit: 0n // Will be calculated based on safety deposit per unit
    }));
}

export function validateSwapParams(params: SwapParams): void {
    if (params.srcAmount <= 0n) {
        throw new Error("Source amount must be positive");
    }
    if (params.dstAmount <= 0n) {
        throw new Error("Destination amount must be positive");
    }
    if (params.deadline <= Math.floor(Date.now() / 1000)) {
        throw new Error("Deadline must be in the future");
    }
    if (params.safetyDepositPerUnit <= 0n) {
        throw new Error("Safety deposit must be positive");
    }
}

// Conversion utilities
export function tonToNano(ton: number): bigint {
    return BigInt(Math.floor(ton * 1e9));
}

export function nanoToTon(nano: bigint): number {
    return Number(nano) / 1e9;
}

export function formatTon(nano: bigint): string {
    return `${nanoToTon(nano).toFixed(4)} TON`;
}

// EVM integration helpers
export function addressToEvm(tonAddress: Address): string {
    // Convert TON address to EVM format for cross-chain operations
    // This is a simplified conversion - in production you'd use proper address mapping
    const hash = tonAddress.hash;
    return "0x" + hash.toString("hex").slice(0, 40);
}

export function evmToTonAddress(evmAddress: string, workchain: number = 0): Address {
    // Convert EVM address to TON format
    // This is a simplified conversion - in production you'd use proper address mapping
    const hash = Buffer.from(evmAddress.slice(2), "hex");
    const paddedHash = Buffer.concat([hash, Buffer.alloc(32 - hash.length, 0)]);
    return Address.parseRaw(`${workchain}:${paddedHash.toString("hex")}`);
}
