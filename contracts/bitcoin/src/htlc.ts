import * as bitcoin from "bitcoinjs-lib";
import { HTLCParams, HTLCScripts } from "./types";
import { hash160 } from "./utils";

export function createHTLCScript(params: HTLCParams): Buffer {
  const { hashlock, timelock, sender, recipient } = params;

  return bitcoin.script.compile([
    bitcoin.opcodes.OP_IF,
    bitcoin.opcodes.OP_SHA256,
    hashlock,
    bitcoin.opcodes.OP_EQUALVERIFY,
    bitcoin.opcodes.OP_DUP,
    bitcoin.opcodes.OP_HASH160,
    hash160(recipient),
    bitcoin.opcodes.OP_ELSE,
    bitcoin.script.number.encode(timelock),
    bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
    bitcoin.opcodes.OP_DROP,
    bitcoin.opcodes.OP_DUP,
    bitcoin.opcodes.OP_HASH160,
    hash160(sender),
    bitcoin.opcodes.OP_ENDIF,
    bitcoin.opcodes.OP_EQUALVERIFY,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);
}

export function createHTLCAddress(
  params: HTLCParams,
  network: bitcoin.Network,
): HTLCScripts {
  const redeemScript = createHTLCScript(params);
  
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: { output: redeemScript },
    network,
  });

  if (!p2wsh.address) {
    throw new Error("Failed to generate HTLC address");
  }

  return {
    redeemScript,
    scriptAddress: p2wsh.address,
    witnessScript: redeemScript,
  };
}

export function createClaimTransaction(
  htlcScripts: HTLCScripts,
  inputTxId: string,
  inputVout: number,
  inputValue: number,
  preimage: Buffer,
  recipientKeyPair: { privateKey: Buffer; publicKey: Buffer },
  recipientAddress: string,
  fee: number,
  network: bitcoin.Network,
): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  tx.version = 2;

  tx.addInput(Buffer.from(inputTxId, "hex").reverse(), inputVout, 0);

  const outputValue = inputValue - fee;
  const outputScript = bitcoin.address.toOutputScript(recipientAddress, network);
  tx.addOutput(outputScript, outputValue);

  const hashType = bitcoin.Transaction.SIGHASH_ALL;
  const signatureHash = tx.hashForWitnessV0(
    0,
    htlcScripts.redeemScript,
    inputValue,
    hashType,
  );

  const signature = bitcoin.script.signature.encode(
    Buffer.from(ecc.sign(signatureHash, recipientKeyPair.privateKey)),
    hashType,
  );

  const witness = [
    signature,
    recipientKeyPair.publicKey,
    preimage,
    Buffer.from([0x01]),
    htlcScripts.redeemScript,
  ];

  tx.setWitness(0, witness);

  return tx;
}

export function createRefundTransaction(
  htlcScripts: HTLCScripts,
  inputTxId: string,
  inputVout: number,
  inputValue: number,
  senderKeyPair: { privateKey: Buffer; publicKey: Buffer },
  senderAddress: string,
  fee: number,
  locktime: number,
  network: bitcoin.Network,
): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.locktime = locktime;

  tx.addInput(Buffer.from(inputTxId, "hex").reverse(), inputVout, 0xfffffffe);

  const outputValue = inputValue - fee;
  const outputScript = bitcoin.address.toOutputScript(senderAddress, network);
  tx.addOutput(outputScript, outputValue);

  const hashType = bitcoin.Transaction.SIGHASH_ALL;
  const signatureHash = tx.hashForWitnessV0(
    0,
    htlcScripts.redeemScript,
    inputValue,
    hashType,
  );

  const signature = bitcoin.script.signature.encode(
    Buffer.from(ecc.sign(signatureHash, senderKeyPair.privateKey)),
    hashType,
  );

  const witness = [
    signature,
    senderKeyPair.publicKey,
    Buffer.from([]),
    htlcScripts.redeemScript,
  ];

  tx.setWitness(0, witness);

  return tx;
}

import * as ecc from "tiny-secp256k1";
bitcoin.initEccLib(ecc);