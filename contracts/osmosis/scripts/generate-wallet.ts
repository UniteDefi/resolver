import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

async function generateWallet() {
  console.log("[WalletGen] Generating new Osmosis testnet wallet...");
  
  const wallet = await DirectSecp256k1HdWallet.generate(24, {
    prefix: "osmo",
  });
  
  const [account] = await wallet.getAccounts();
  const mnemonic = wallet.mnemonic;
  
  console.log("\n=== NEW OSMOSIS TESTNET WALLET ===");
  console.log("Address:", account.address);
  console.log("\nMnemonic (SAVE THIS SECURELY):");
  console.log(mnemonic);
  console.log("\n=== IMPORTANT ===");
  console.log("1. Save the mnemonic phrase securely");
  console.log("2. Fund this address with testnet OSMO");
  console.log("3. Update OSMO_TESTNET_MNEMONIC in your .env file");
  console.log("\nTestnet faucet: https://faucet.testnet.osmosis.zone/");
  
  return {
    address: account.address,
    mnemonic: mnemonic,
  };
}

generateWallet()
  .then((result) => {
    console.log("\n[WalletGen] Wallet generated successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[WalletGen] Error:", error);
    process.exit(1);
  });
