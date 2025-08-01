import { InMemorySigner } from "@taquito/signer";
import { b58cencode, prefix, generateMnemonic, mnemonicToSeed } from "@taquito/utils";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

async function generateWallet() {
  console.log("[Wallet Generator] Generating new Tezos wallet...");
  
  // Generate mnemonic
  const mnemonic = bip39.generateMnemonic(256);
  console.log("\n[Wallet Generator] Mnemonic (SAVE THIS SECURELY):");
  console.log(mnemonic);
  
  // Derive seed from mnemonic
  const seed = await bip39.mnemonicToSeed(mnemonic);
  
  // Derive key using standard Tezos derivation path
  const derivationPath = "m/44'/1729'/0'/0'";
  const { key } = derivePath(derivationPath, seed.toString("hex"));
  
  // Create signer
  const signer = new InMemorySigner(b58cencode(key, prefix.edsk2));
  
  // Get account details
  const secretKey = await signer.secretKey();
  const publicKey = await signer.publicKey();
  const publicKeyHash = await signer.publicKeyHash();
  
  console.log("\n[Wallet Generator] Wallet Details:");
  console.log("Address:", publicKeyHash);
  console.log("Public Key:", publicKey);
  console.log("Secret Key:", secretKey);
  
  console.log("\n[Wallet Generator] Network: Ghostnet (Testnet)");
  console.log("Faucet: https://faucet.ghostnet.teztnets.com/");
  console.log("\n[Wallet Generator] Please fund this address before deploying contracts!");
  
  return {
    mnemonic,
    address: publicKeyHash,
    publicKey,
    secretKey,
  };
}

// Run generator
generateWallet().catch(console.error);