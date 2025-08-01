import { mnemonicGenerate, cryptoWaitReady } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";

async function generateWallet() {
  await cryptoWaitReady();
  
  // Generate a new mnemonic
  const mnemonic = mnemonicGenerate();
  
  // Create keyring instance
  const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
  
  // Add account from mnemonic
  const account = keyring.addFromUri(mnemonic);
  
  console.log("[Wallet Generator] New wallet created!");
  console.log("[Wallet Generator] =====================================");
  console.log("[Wallet Generator] Mnemonic (SAVE THIS SECURELY):");
  console.log(`[Wallet Generator] ${mnemonic}`);
  console.log("[Wallet Generator] =====================================");
  console.log("[Wallet Generator] Address:", account.address);
  console.log("[Wallet Generator] =====================================");
  
  return {
    mnemonic,
    address: account.address
  };
}

generateWallet().catch(console.error);