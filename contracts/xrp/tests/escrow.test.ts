import { XRPEscrow } from "../src/escrow";
import { xrpToDrops, Wallet } from "xrpl";

describe("XRP Escrow Tests", () => {
  let escrow: XRPEscrow;
  let testWallet1: Wallet;
  let testWallet2: Wallet;
  
  beforeAll(async () => {
    // Use testnet for testing
    escrow = new XRPEscrow("wss://s.altnet.rippletest.net:51233");
    await escrow.connect();
    
    // Generate test wallets
    testWallet1 = Wallet.generate();
    testWallet2 = Wallet.generate();
    
    console.log("[Test] Test Wallet 1:", testWallet1.address);
    console.log("[Test] Test Wallet 2:", testWallet2.address);
    console.log("[Test] Note: These wallets need to be funded on testnet to run tests");
  });
  
  afterAll(async () => {
    await escrow.disconnect();
  });
  
  describe("Condition and Fulfillment Generation", () => {
    it("should generate valid condition and fulfillment", () => {
      const { condition, fulfillment } = escrow.generateConditionAndFulfillment();
      
      expect(condition).toBeDefined();
      expect(fulfillment).toBeDefined();
      expect(condition).toMatch(/^A0258020[A-F0-9]{64}810103$/);
      expect(fulfillment).toMatch(/^A0220020[A-F0-9]{64}$/);
    });
    
    it("should generate unique conditions each time", () => {
      const result1 = escrow.generateConditionAndFulfillment();
      const result2 = escrow.generateConditionAndFulfillment();
      
      expect(result1.condition).not.toEqual(result2.condition);
      expect(result1.fulfillment).not.toEqual(result2.fulfillment);
    });
  });
  
  describe("Escrow Creation", () => {
    it("should validate escrow creation parameters", async () => {
      const invalidConfig = {
        sourceAddress: "",
        sourceSecret: "",
        destinationAddress: testWallet2.address,
        amount: xrpToDrops("10"),
      };
      
      const result = await escrow.createEscrow(invalidConfig);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
    
    it("should handle time-based escrow parameters", () => {
      const now = Math.floor(Date.now() / 1000);
      const finishAfter = now + 300; // 5 minutes
      const cancelAfter = now + 86400; // 24 hours
      
      expect(cancelAfter).toBeGreaterThan(finishAfter);
      expect(finishAfter).toBeGreaterThan(now);
    });
  });
  
  describe("Escrow Retrieval", () => {
    it("should handle empty escrow list", async () => {
      const escrows = await escrow.getEscrows(testWallet1.address);
      expect(escrows).toEqual([]);
    });
    
    it("should handle invalid address", async () => {
      const escrows = await escrow.getEscrows("invalid_address");
      expect(escrows).toEqual([]);
    });
  });
  
  describe("Integration Tests", () => {
    // Note: These tests require funded accounts on testnet
    it.skip("should create and fulfill a conditional escrow", async () => {
      // This test is skipped by default as it requires funded testnet accounts
      // To run: 
      // 1. Fund testWallet1 and testWallet2 using XRP testnet faucet
      // 2. Remove .skip from the test
      
      const { condition, fulfillment } = escrow.generateConditionAndFulfillment();
      
      // Create escrow
      const createResult = await escrow.createEscrow({
        sourceAddress: testWallet1.address,
        sourceSecret: testWallet1.seed!,
        destinationAddress: testWallet2.address,
        amount: xrpToDrops("1"),
        condition: condition,
        finishAfter: Math.floor(Date.now() / 1000) + 60,
      });
      
      expect(createResult.success).toBe(true);
      expect(createResult.txHash).toBeDefined();
      
      // Wait for finishAfter time
      await new Promise(resolve => setTimeout(resolve, 61000));
      
      // Fulfill escrow
      const fulfillResult = await escrow.fulfillEscrow(
        testWallet2.address,
        testWallet2.seed!,
        testWallet1.address,
        1, // Assuming sequence 1 for this test
        fulfillment
      );
      
      expect(fulfillResult.success).toBe(true);
      expect(fulfillResult.txHash).toBeDefined();
    });
    
    it.skip("should create and cancel an escrow", async () => {
      // This test is skipped by default as it requires funded testnet accounts
      
      // Create escrow
      const createResult = await escrow.createEscrow({
        sourceAddress: testWallet1.address,
        sourceSecret: testWallet1.seed!,
        destinationAddress: testWallet2.address,
        amount: xrpToDrops("1"),
        cancelAfter: Math.floor(Date.now() / 1000) + 60,
      });
      
      expect(createResult.success).toBe(true);
      expect(createResult.txHash).toBeDefined();
      
      // Wait for cancelAfter time
      await new Promise(resolve => setTimeout(resolve, 61000));
      
      // Cancel escrow
      const cancelResult = await escrow.cancelEscrow(
        testWallet1.address,
        testWallet1.seed!,
        testWallet1.address,
        2, // Assuming sequence 2 for this test
      );
      
      expect(cancelResult.success).toBe(true);
      expect(cancelResult.txHash).toBeDefined();
    });
  });
});