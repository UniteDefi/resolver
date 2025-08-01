import * as bitcoin from "bitcoinjs-lib";
import { createHTLCAddress, createClaimTransaction, createRefundTransaction } from "../src/htlc";
import { createKeyPair, sha256, getCurrentTimestamp } from "../src/utils";
import { HTLCParams } from "../src/types";
import { fundAddress, sendRawTransaction, mineTransaction, generateBlocks } from "./test_helpers";

const network = bitcoin.networks.regtest;

describe("HTLC Tests", () => {
  let senderKeyPair: ReturnType<typeof createKeyPair>;
  let recipientKeyPair: ReturnType<typeof createKeyPair>;
  let preimage: Buffer;
  let hashlock: Buffer;

  beforeAll(async () => {
    await generateBlocks(101);
    
    senderKeyPair = createKeyPair(network);
    recipientKeyPair = createKeyPair(network);
    
    preimage = Buffer.from("supersecretpreimage123456789012", "utf8");
    hashlock = sha256(preimage);
    
    console.log("[HTLC Test] Sender address:", senderKeyPair.address);
    console.log("[HTLC Test] Recipient address:", recipientKeyPair.address);
    console.log("[HTLC Test] Preimage:", preimage.toString("hex"));
    console.log("[HTLC Test] Hashlock:", hashlock.toString("hex"));
  });

  describe("HTLC Creation", () => {
    it("should create a valid HTLC address", () => {
      const timelock = getCurrentTimestamp() + 3600;
      
      const htlcParams: HTLCParams = {
        hashlock,
        timelock,
        sender: senderKeyPair.publicKey,
        recipient: recipientKeyPair.publicKey,
      };

      const htlcScripts = createHTLCAddress(htlcParams, network);
      
      expect(htlcScripts.scriptAddress).toBeDefined();
      expect(htlcScripts.redeemScript).toBeDefined();
      expect(htlcScripts.scriptAddress.startsWith("bcrt1")).toBe(true);
      
      console.log("[HTLC Test] HTLC address created:", htlcScripts.scriptAddress);
    });
  });

  describe("HTLC Claim", () => {
    it("should successfully claim HTLC with correct preimage", async () => {
      const timelock = getCurrentTimestamp() + 3600;
      
      const htlcParams: HTLCParams = {
        hashlock,
        timelock,
        sender: senderKeyPair.publicKey,
        recipient: recipientKeyPair.publicKey,
      };

      const htlcScripts = createHTLCAddress(htlcParams, network);
      
      const fundAmount = 0.1;
      const funding = await fundAddress(htlcScripts.scriptAddress, fundAmount);
      console.log("[HTLC Test] Funded HTLC:", funding.txid);
      
      const fee = 1000;
      const claimTx = createClaimTransaction(
        htlcScripts,
        funding.txid,
        funding.vout,
        Math.floor(fundAmount * 100000000),
        preimage,
        recipientKeyPair,
        recipientKeyPair.address,
        fee,
        network,
      );
      
      const claimTxHex = claimTx.toHex();
      const claimTxId = await sendRawTransaction(claimTxHex);
      
      console.log("[HTLC Test] Claim transaction sent:", claimTxId);
      
      await mineTransaction(claimTxId);
      
      expect(claimTxId).toBeDefined();
    });
  });

  describe("HTLC Refund", () => {
    it("should successfully refund HTLC after timelock", async () => {
      const currentTime = getCurrentTimestamp();
      const timelock = currentTime + 10;
      
      const htlcParams: HTLCParams = {
        hashlock,
        timelock,
        sender: senderKeyPair.publicKey,
        recipient: recipientKeyPair.publicKey,
      };

      const htlcScripts = createHTLCAddress(htlcParams, network);
      
      const fundAmount = 0.1;
      const funding = await fundAddress(htlcScripts.scriptAddress, fundAmount);
      console.log("[HTLC Test] Funded HTLC for refund:", funding.txid);
      
      console.log("[HTLC Test] Waiting for timelock to expire...");
      await generateBlocks(15);
      
      const fee = 1000;
      const refundTx = createRefundTransaction(
        htlcScripts,
        funding.txid,
        funding.vout,
        Math.floor(fundAmount * 100000000),
        senderKeyPair,
        senderKeyPair.address,
        fee,
        timelock,
        network,
      );
      
      const refundTxHex = refundTx.toHex();
      const refundTxId = await sendRawTransaction(refundTxHex);
      
      console.log("[HTLC Test] Refund transaction sent:", refundTxId);
      
      await mineTransaction(refundTxId);
      
      expect(refundTxId).toBeDefined();
    });
  });

  describe("HTLC Security", () => {
    it("should fail to claim with wrong preimage", async () => {
      const timelock = getCurrentTimestamp() + 3600;
      
      const htlcParams: HTLCParams = {
        hashlock,
        timelock,
        sender: senderKeyPair.publicKey,
        recipient: recipientKeyPair.publicKey,
      };

      const htlcScripts = createHTLCAddress(htlcParams, network);
      
      const fundAmount = 0.1;
      const funding = await fundAddress(htlcScripts.scriptAddress, fundAmount);
      
      const wrongPreimage = Buffer.from("wrongpreimage12345678901234567890", "utf8");
      const fee = 1000;
      
      const claimTx = createClaimTransaction(
        htlcScripts,
        funding.txid,
        funding.vout,
        Math.floor(fundAmount * 100000000),
        wrongPreimage,
        recipientKeyPair,
        recipientKeyPair.address,
        fee,
        network,
      );
      
      const claimTxHex = claimTx.toHex();
      
      await expect(sendRawTransaction(claimTxHex)).rejects.toThrow();
    });

    it("should fail to refund before timelock", async () => {
      const timelock = getCurrentTimestamp() + 3600;
      
      const htlcParams: HTLCParams = {
        hashlock,
        timelock,
        sender: senderKeyPair.publicKey,
        recipient: recipientKeyPair.publicKey,
      };

      const htlcScripts = createHTLCAddress(htlcParams, network);
      
      const fundAmount = 0.1;
      const funding = await fundAddress(htlcScripts.scriptAddress, fundAmount);
      
      const fee = 1000;
      const refundTx = createRefundTransaction(
        htlcScripts,
        funding.txid,
        funding.vout,
        Math.floor(fundAmount * 100000000),
        senderKeyPair,
        senderKeyPair.address,
        fee,
        timelock,
        network,
      );
      
      const refundTxHex = refundTx.toHex();
      
      await expect(sendRawTransaction(refundTxHex)).rejects.toThrow();
    });
  });
});