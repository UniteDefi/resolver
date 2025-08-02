import { describe, it, expect } from "@jest/globals";
import { 
    generateSecret, 
    calculateHashlock, 
    createSwapParams,
    createDefaultTimelocks,
    formatTon,
    tonToNano,
    nanoToTon
} from "../utils/crosschain";
import { Address, toNano } from "@ton/core";

describe("🔧 Utility Functions", () => {
    it("should generate valid secrets and hashlocks", () => {
        const secret1 = generateSecret();
        const secret2 = generateSecret();
        
        expect(secret1).not.toBe(secret2);
        expect(secret1).toBeInstanceOf(BigInt);
        expect(secret2).toBeInstanceOf(BigInt);
        
        const hashlock1 = calculateHashlock(secret1);
        const hashlock2 = calculateHashlock(secret2);
        
        expect(hashlock1).not.toBe(hashlock2);
        expect(hashlock1).toBeInstanceOf(BigInt);
        
        // Same secret should produce same hashlock
        expect(calculateHashlock(secret1)).toBe(hashlock1);
    });
    
    it("should create valid swap parameters", () => {
        const maker = Address.parse("0QAO3w5QGT5GKxnhPSHrtGMZSCOzD4LlhcyNyuL_8Gl7-_pF");
        const srcAmount = toNano("100");
        const dstAmount = BigInt("100000000"); // 100 USDT
        
        const params = createSwapParams(
            maker,
            null, // TON
            "0x1234567890123456789012345678901234567890",
            srcAmount,
            dstAmount,
            Math.floor(Date.now() / 1000) + 3600,
            1
        );
        
        expect(params.maker).toBe(maker);
        expect(params.srcAmount).toBe(srcAmount);
        expect(params.dstAmount).toBe(dstAmount);
        expect(params.secret).toBeInstanceOf(BigInt);
        expect(params.hashlock).toBeInstanceOf(BigInt);
        expect(params.orderHash).toBeInstanceOf(BigInt);
        expect(params.safetyDepositPerUnit).toBeGreaterThan(0n);
    });
    
    it("should handle TON conversions correctly", () => {
        expect(tonToNano(1)).toBe(toNano("1"));
        expect(tonToNano(0.5)).toBe(toNano("0.5"));
        expect(tonToNano(100)).toBe(toNano("100"));
        
        expect(nanoToTon(toNano("1"))).toBe(1);
        expect(nanoToTon(toNano("0.5"))).toBe(0.5);
        expect(nanoToTon(toNano("100"))).toBe(100);
        
        expect(formatTon(toNano("1.2345"))).toBe("1.2345 TON");
        expect(formatTon(toNano("100"))).toBe("100.0000 TON");
    });
    
    it("should create default timelocks", () => {
        const timelocks = createDefaultTimelocks();
        
        expect(timelocks.srcWithdrawal).toBe(0);
        expect(timelocks.srcPublicWithdrawal).toBe(900);
        expect(timelocks.srcCancellation).toBe(1800);
        expect(timelocks.srcPublicCancellation).toBe(3600);
        expect(timelocks.dstWithdrawal).toBe(0);
        expect(timelocks.dstPublicWithdrawal).toBe(900);
        expect(timelocks.dstCancellation).toBe(2700);
    });
});
