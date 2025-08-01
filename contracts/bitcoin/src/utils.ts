import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { KeyPair } from "./types";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export function createKeyPair(network: bitcoin.Network): KeyPair {
  const keyPair = ECPair.makeRandom({ network });
  const { address } = bitcoin.payments.p2wpkh({ 
    pubkey: keyPair.publicKey, 
    network,
  });

  if (!address) {
    throw new Error("Failed to generate address");
  }

  return {
    privateKey: keyPair.privateKey!,
    publicKey: keyPair.publicKey,
    address,
  };
}

export function getKeyPairFromWIF(wif: string, network: bitcoin.Network): KeyPair {
  const keyPair = ECPair.fromWIF(wif, network);
  const { address } = bitcoin.payments.p2wpkh({ 
    pubkey: keyPair.publicKey, 
    network,
  });

  if (!address) {
    throw new Error("Failed to generate address");
  }

  return {
    privateKey: keyPair.privateKey!,
    publicKey: keyPair.publicKey,
    address,
  };
}

export function hash160(buffer: Buffer): Buffer {
  return bitcoin.crypto.hash160(buffer);
}

export function sha256(buffer: Buffer): Buffer {
  return bitcoin.crypto.sha256(buffer);
}

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function bip65Encode(timestamp: number): number {
  if (timestamp < 500000000) {
    return timestamp;
  }
  return timestamp;
}