import { DutchAuctionService, DutchAuctionParams } from "../services/common/dutch-auction.service";

describe("Dutch Auction Service Tests", () => {
  const srcAmount = "1000000000"; // 1000 USDT (6 decimals)
  const srcDecimals = 6;
  const dstDecimals = 6;
  
  describe("createAuctionParams", () => {
    it("should create valid auction parameters", () => {
      const minPrice = "950000"; // 0.95 (worst price for user)
      const marketPrice = "1000000"; // 1.0 (best price for user)
      const duration = 300; // 5 minutes
      
      const params = DutchAuctionService.createAuctionParams(minPrice, marketPrice, duration);
      
      expect(params.startPrice).toBe(minPrice);
      expect(params.endPrice).toBe(marketPrice);
      expect(params.duration).toBe(duration);
      expect(params.startTime).toBeGreaterThan(0);
    });
    
    it("should throw on invalid inputs", () => {
      expect(() => 
        DutchAuctionService.createAuctionParams("0", "1000000", 300)
      ).toThrow("Minimum acceptable price must be positive");
      
      expect(() => 
        DutchAuctionService.createAuctionParams("950000", "0", 300)
      ).toThrow("Market price must be positive");
      
      expect(() => 
        DutchAuctionService.createAuctionParams("950000", "1000000", 0)
      ).toThrow("Auction duration must be positive");
    });
  });
  
  describe("calculateCurrentPrice", () => {
    let params: DutchAuctionParams;
    
    beforeEach(() => {
      params = {
        startPrice: "950000", // 0.95
        endPrice: "1000000", // 1.0
        startTime: Date.now(),
        duration: 300 // 5 minutes
      };
    });
    
    it("should return start price at t=0", () => {
      const result = DutchAuctionService.calculateCurrentPrice(params, params.startTime);
      
      expect(result.currentPrice).toBe("950000");
      expect(result.timeElapsed).toBe(0);
      expect(result.priceImprovement).toBe(0);
      expect(result.isExpired).toBe(false);
    });
    
    it("should calculate intermediate price correctly", () => {
      // Test at 50% time elapsed (150 seconds)
      const halfwayTime = params.startTime + 150 * 1000;
      const result = DutchAuctionService.calculateCurrentPrice(params, halfwayTime);
      
      // Price should be halfway between start and end
      expect(result.currentPrice).toBe("975000"); // 0.975
      expect(result.timeElapsed).toBe(150);
      expect(result.priceImprovement).toBeCloseTo(2.63, 1); // ~2.63% improvement
      expect(result.isExpired).toBe(false);
    });
    
    it("should return end price when expired", () => {
      const expiredTime = params.startTime + 301 * 1000;
      const result = DutchAuctionService.calculateCurrentPrice(params, expiredTime);
      
      expect(result.currentPrice).toBe("1000000");
      expect(result.timeElapsed).toBe(300);
      expect(result.priceImprovement).toBe(100);
      expect(result.isExpired).toBe(true);
    });
  });
  
  describe("calculateTokenAmounts", () => {
    it("should calculate correct amounts for same decimals", () => {
      const currentPrice = "980000"; // 0.98
      const result = DutchAuctionService.calculateTokenAmounts(
        srcAmount,
        srcDecimals,
        dstDecimals,
        currentPrice
      );
      
      // 1000 USDT * 0.98 = 980 DAI
      expect(result.takerAmount).toBe(srcAmount);
      expect(result.makerAmount).toBe("980000000"); // 980 DAI
    });
    
    it("should handle different decimals correctly", () => {
      const currentPrice = "1000000"; // 1.0
      const result = DutchAuctionService.calculateTokenAmounts(
        srcAmount,
        6, // USDT has 6 decimals
        18, // DAI has 18 decimals
        currentPrice
      );
      
      // 1000 USDT (6 decimals) = 1000 DAI (18 decimals)
      expect(result.takerAmount).toBe(srcAmount);
      expect(result.makerAmount).toBe("1000000000000000000000"); // 1000 * 10^18
    });
  });
  
  describe("validateResolverPrice", () => {
    let params: DutchAuctionParams;
    
    beforeEach(() => {
      params = {
        startPrice: "950000", // 0.95 (worst)
        endPrice: "1000000", // 1.0 (best)
        startTime: Date.now(),
        duration: 300
      };
    });
    
    it("should accept valid prices", () => {
      const currentTime = params.startTime + 150 * 1000; // Halfway
      
      // Current price should be 0.975
      const result1 = DutchAuctionService.validateResolverPrice(params, "975000", currentTime);
      expect(result1.valid).toBe(true);
      
      // Better price should be accepted
      const result2 = DutchAuctionService.validateResolverPrice(params, "980000", currentTime);
      expect(result2.valid).toBe(true);
    });
    
    it("should reject worse prices", () => {
      const currentTime = params.startTime + 150 * 1000; // Halfway
      
      // Current price is 0.975, so 0.97 is worse
      const result = DutchAuctionService.validateResolverPrice(params, "970000", currentTime);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("worse than current auction price");
    });
    
    it("should reject expired auctions", () => {
      const expiredTime = params.startTime + 301 * 1000;
      
      const result = DutchAuctionService.validateResolverPrice(params, "1000000", expiredTime);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Auction has expired");
    });
  });
  
  describe("formatPrice", () => {
    it("should format prices correctly", () => {
      expect(DutchAuctionService.formatPrice("1000000", 2)).toBe("1.00");
      expect(DutchAuctionService.formatPrice("950000", 2)).toBe("0.95");
      expect(DutchAuctionService.formatPrice("1234567", 3)).toBe("1.234");
    });
  });
});

// Run the tests if this file is executed directly
if (require.main === module) {
  // Simple test runner
  const tests: Array<() => void> = [];
  let currentDescribe = "";
  let currentIt = "";
  
  function describe(name: string, fn: () => void) {
    currentDescribe = name;
    console.log(`\n${name}`);
    fn();
  }
  
  function it(name: string, fn: () => void) {
    currentIt = name;
    try {
      fn();
      console.log(`   ${name}`);
    } catch (error) {
      console.log(`   ${name}`);
      console.error(`    ${error}`);
    }
  }
  
  function expect(actual: any) {
    return {
      toBe(expected: any) {
        if (actual !== expected) {
          throw new Error(`Expected ${actual} to be ${expected}`);
        }
      },
      toBeGreaterThan(expected: any) {
        if (!(actual > expected)) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeCloseTo(expected: number, precision: number = 2) {
        const diff = Math.abs(actual - expected);
        const maxDiff = Math.pow(10, -precision) / 2;
        if (diff > maxDiff) {
          throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff})`);
        }
      },
      toThrow(message?: string) {
        try {
          actual();
          throw new Error(`Expected function to throw`);
        } catch (error: any) {
          if (message && !error.message.includes(message)) {
            throw new Error(`Expected error to contain "${message}" but got "${error.message}"`);
          }
        }
      },
      toContain(substring: string) {
        if (!actual.includes(substring)) {
          throw new Error(`Expected "${actual}" to contain "${substring}"`);
        }
      }
    };
  }
  
  let beforeEachFn: (() => void) | null = null;
  
  function beforeEach(fn: () => void) {
    beforeEachFn = fn;
  }
  
  // Import the test module
  require("./dutch-auction.test");
}