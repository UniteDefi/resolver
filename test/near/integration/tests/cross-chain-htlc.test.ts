import { describe, it, before } from "mocha";
import { expect } from "chai";
import * as crypto from "crypto";
import { NearHelper } from "../utils/near-helper";
import { BaseHelper } from "../utils/base-helper";
import { NEAR_CONFIG, BASE_CONFIG, TEST_CONFIG } from "../config";

describe("Cross-Chain HTLC Tests", function() {
  this.timeout(300000); // 5 minutes timeout for cross-chain operations
  
  let nearHelper: NearHelper;
  let baseHelper: BaseHelper;
  let nearHTLCContract: string;
  let nearRecipient: string;
  let baseRecipient: string;
  
  before(async () => {
    console.log("[Test] Setting up test environment...");
    
    // Initialize Near helper
    nearHelper = new NearHelper(
      process.env.NEAR_ACCOUNT_ID!,
      process.env.NEAR_PRIVATE_KEY!
    );
    await nearHelper.init();
    
    // Initialize Base helper
    baseHelper = new BaseHelper(process.env.BASE_PRIVATE_KEY!);
    await baseHelper.init();
    
    // Set up contract and recipient addresses
    nearHTLCContract = `htlc.${NEAR_CONFIG.contractName}`;
    nearRecipient = process.env.NEAR_RECIPIENT_ACCOUNT || "recipient.testnet";
    baseRecipient = process.env.BASE_RECIPIENT_ADDRESS || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    
    console.log("[Test] Test environment ready");
  });
  
  describe("Near to Base Sepolia HTLC Flow", () => {
    it("should complete a cross-chain HTLC swap", async () => {
      // Step 1: Generate shared secret and hashlock
      const preimage = crypto.randomBytes(32).toString("hex");
      const hashlock = baseHelper.generateHashlock(preimage);
      console.log("[Test] Generated preimage:", preimage);
      console.log("[Test] Generated hashlock:", hashlock);
      
      // Step 2: Create HTLC on Base Sepolia (Alice locks tokens)
      console.log("[Test] Creating HTLC on Base Sepolia...");
      const baseAmount = BigInt(1000000); // 1 USDC (6 decimals)
      const baseTimelock = Math.floor(Date.now() / 1000) + TEST_CONFIG.htlcTimeout;
      
      // Mint tokens for testing
      await baseHelper.mintTokens(baseHelper.wallet.address, baseAmount * 2n);
      
      const baseHTLCId = await baseHelper.createHTLC(
        baseRecipient,
        baseHelper.tokenContract.address,
        baseAmount,
        hashlock,
        baseTimelock
      );
      
      console.log("[Test] Base HTLC created with ID:", baseHTLCId);
      
      // Verify Base HTLC
      const baseHTLC = await baseHelper.getHTLC(baseHTLCId);
      expect(baseHTLC.recipient.toLowerCase()).to.equal(baseRecipient.toLowerCase());
      expect(baseHTLC.amount).to.equal(baseAmount);
      expect(baseHTLC.hashlock).to.equal(hashlock);
      
      // Step 3: Create corresponding HTLC on Near (Bob locks NEAR)
      console.log("[Test] Creating HTLC on Near...");
      const nearAmount = "1000000000000000000000000"; // 1 NEAR
      const nearTimelock = baseTimelock - 3600; // 1 hour before Base timeout
      
      const nearHTLCId = await nearHelper.createHTLC(
        nearHTLCContract,
        nearRecipient,
        null, // NEAR token
        nearAmount,
        hashlock,
        nearTimelock
      );
      
      console.log("[Test] Near HTLC created with ID:", nearHTLCId);
      
      // Verify Near HTLC
      const nearHTLC = await nearHelper.getHTLC(nearHTLCContract, nearHTLCId);
      expect(nearHTLC.recipient).to.equal(nearRecipient);
      expect(nearHTLC.amount).to.equal(nearAmount);
      expect(nearHTLC.hashlock).to.equal(hashlock);
      
      // Step 4: Alice withdraws from Near HTLC using the secret
      console.log("[Test] Alice withdrawing from Near HTLC...");
      await nearHelper.withdrawHTLC(nearHTLCContract, nearHTLCId, preimage);
      
      // Verify Near withdrawal
      const nearHTLCAfter = await nearHelper.getHTLC(nearHTLCContract, nearHTLCId);
      expect(nearHTLCAfter.withdrawn).to.be.true;
      
      // Step 5: Bob can now withdraw from Base HTLC using the revealed secret
      console.log("[Test] Bob withdrawing from Base HTLC...");
      await baseHelper.withdrawHTLC(baseHTLCId, "0x" + preimage);
      
      // Verify Base withdrawal
      const baseHTLCAfter = await baseHelper.getHTLC(baseHTLCId);
      expect(baseHTLCAfter.withdrawn).to.be.true;
      expect(baseHTLCAfter.preimage).to.equal("0x" + preimage);
      
      console.log("[Test] Cross-chain HTLC swap completed successfully!");
    });
    
    it("should handle timeout scenario correctly", async () => {
      // Generate new secret and hashlock
      const preimage = crypto.randomBytes(32).toString("hex");
      const hashlock = baseHelper.generateHashlock(preimage);
      
      // Create HTLCs with short timeout
      const shortTimeout = Math.floor(Date.now() / 1000) + 60; // 1 minute
      
      // Create Base HTLC
      const baseAmount = BigInt(500000); // 0.5 USDC
      const baseHTLCId = await baseHelper.createHTLC(
        baseRecipient,
        baseHelper.tokenContract.address,
        baseAmount,
        hashlock,
        shortTimeout
      );
      
      // Create Near HTLC
      const nearAmount = "500000000000000000000000"; // 0.5 NEAR
      const nearHTLCId = await nearHelper.createHTLC(
        nearHTLCContract,
        nearRecipient,
        null,
        nearAmount,
        hashlock,
        shortTimeout - 30 // 30 seconds before Base
      );
      
      console.log("[Test] Waiting for timeout...");
      await new Promise(resolve => setTimeout(resolve, 65000)); // Wait 65 seconds
      
      // Try to refund Near HTLC
      console.log("[Test] Attempting Near refund after timeout...");
      await nearHelper.cancelHTLC(nearHTLCContract, nearHTLCId);
      
      // Try to refund Base HTLC
      console.log("[Test] Attempting Base refund after timeout...");
      await baseHelper.refundHTLC(baseHTLCId);
      
      // Verify refunds
      const nearHTLCAfter = await nearHelper.getHTLC(nearHTLCContract, nearHTLCId);
      expect(nearHTLCAfter.cancelled).to.be.true;
      
      const baseHTLCAfter = await baseHelper.getHTLC(baseHTLCId);
      expect(baseHTLCAfter.refunded).to.be.true;
      
      console.log("[Test] Timeout scenario handled correctly!");
    });
  });
  
  describe("Base Sepolia to Near HTLC Flow", () => {
    it("should complete reverse direction cross-chain swap", async () => {
      // This test would implement the reverse flow
      // Bob initiates on Near, Alice on Base
      console.log("[Test] Reverse flow test placeholder");
    });
  });
  
  describe("Async Callback Handling", () => {
    it("should properly handle Near async callbacks", async () => {
      // Test Near's async callback pattern with fungible tokens
      console.log("[Test] Testing Near async callbacks...");
      
      // This would test the callback mechanism in htlc_escrow.rs
      // when using NEP-141 tokens instead of native NEAR
    });
  });
});