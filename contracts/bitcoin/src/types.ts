export interface HTLCParams {
  hashlock: Buffer;
  timelock: number;
  sender: Buffer;
  recipient: Buffer;
}

export interface TransactionInput {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: Buffer;
}

export interface KeyPair {
  privateKey: Buffer;
  publicKey: Buffer;
  address: string;
}

export interface HTLCScripts {
  redeemScript: Buffer;
  scriptAddress: string;
  witnessScript?: Buffer;
}

export interface SpendingConditions {
  preimage?: Buffer;
  signature: Buffer;
  publicKey: Buffer;
}