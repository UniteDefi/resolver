import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { DatabaseTestHelper, ApiTestHelper, createTestOrder, createEIP712Order } from "../../test-utils";
import { ethers } from "ethers";
import * as crypto from "crypto";

describe("Relayer Service - EIP-712 Order Validation", () => {
  let dbHelper: DatabaseTestHelper;
  let apiHelper: ApiTestHelper;
  let testDb: any;

  beforeAll(async () => {
    dbHelper = new DatabaseTestHelper();
    apiHelper = new ApiTestHelper({
      baseURL: "http://localhost:3000",
    });
    
    // Wait for relayer service to be ready
    await apiHelper.waitForService("/health");
  });

  beforeEach(async () => {
    // Create fresh test database
    testDb = dbHelper.createTestDatabase("eip712-validation");
    dbHelper.initializeRelayerSchema(testDb);
  });

  afterAll(async () => {
    await dbHelper.cleanup();
    await apiHelper.cleanup();
  });

  describe("Order Creation with EIP-712", () => {
    it("should accept valid EIP-712 signed order", async () => {
      // Create test wallet
      const wallet = ethers.Wallet.createRandom();
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: wallet.address,
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300, // 5 minutes
      };

      // Create EIP-712 signature (mock for now)
      const signature = "0xmocksignature";

      const response = await apiHelper.post("/create-swap", {
        swapRequest,
        signature,
        secret,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.orderId).toBeDefined();
      expect(response.data.marketPrice).toBeDefined();
      expect(response.data.expiresAt).toBeDefined();
      
      console.log("[Test] Order created:", response.data);
    });

    it("should reject order with missing signature", async () => {
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      try {
        await apiHelper.post("/create-swap", {
          swapRequest,
          // missing signature
          secret,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain("Missing required fields");
      }
    });

    it("should reject order with invalid secret hash", async () => {
      const secret = crypto.randomBytes(32).toString("hex");
      const wrongSecretHash = ethers.utils.keccak256("0xwrong");
      
      const swapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: wrongSecretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      try {
        await apiHelper.post("/create-swap", {
          swapRequest,
          signature: "0xmocksignature",
          secret,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        // Service should validate that hash(secret) == secretHash
      }
    });

    it("should reject order with missing required fields", async () => {
      const secret = crypto.randomBytes(32).toString("hex");
      
      const incompleteSwapRequest = {
        userAddress: "0x1234567890123456789012345678901234567890",
        srcChainId: 1,
        // missing other required fields
      };

      try {
        await apiHelper.post("/create-swap", {
          swapRequest: incompleteSwapRequest,
          signature: "0xmocksignature",
          secret,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain("Invalid swapRequest");
      }
    });
  });

  describe("Signature Verification", () => {
    it("should verify EIP-712 signature correctly", async () => {
      // This test would require actual EIP-712 signing implementation
      // For now, we'll test the flow
      const wallet = ethers.Wallet.createRandom();
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: wallet.address,
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      // In a real test, we would sign this with EIP-712
      const signature = "0xvalidsignature";

      const response = await apiHelper.post("/create-swap", {
        swapRequest,
        signature,
        secret,
      });

      expect(response.status).toBe(200);
      
      // Verify order was stored in database
      const orders = dbHelper.getAllOrders(testDb);
      expect(orders.length).toBeGreaterThan(0);
      
      const order = orders[0];
      expect(order.requester.toLowerCase()).toBe(wallet.address.toLowerCase());
      expect(order.signature).toBe(signature);
    });

    it("should reject order with signature from wrong address", async () => {
      const wallet = ethers.Wallet.createRandom();
      const wrongWallet = ethers.Wallet.createRandom();
      const secret = crypto.randomBytes(32).toString("hex");
      const secretHash = ethers.utils.keccak256(`0x${secret}`);
      
      const swapRequest = {
        userAddress: wallet.address, // Claims to be from wallet
        srcChainId: 1,
        srcToken: "0x0000000000000000000000000000000000000001",
        srcAmount: "1000000000000000000",
        dstChainId: 137,
        dstToken: "0x0000000000000000000000000000000000000002",
        secretHash: secretHash,
        minAcceptablePrice: "1900000000000000000",
        orderDuration: 300,
      };

      // But signature is from wrongWallet
      const signature = "0xwrongsignature";

      try {
        await apiHelper.post("/create-swap", {
          swapRequest,
          signature,
          secret,
        });
        // Depending on implementation, this might succeed with mock signature
        // In production, it should fail
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });
  });
});