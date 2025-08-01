import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { stringToPath } from "@cosmjs/crypto";

async function generateWallet() {
  console.log("[Wallet] Generating new Neutron wallet...");
  
  const wallet = await DirectSecp256k1HdWallet.generate(24, {
    prefix: "neutron",
  });
  
  const mnemonic = wallet.mnemonic;
  const [account] = await wallet.getAccounts();
  
  console.log("=".repeat(80));
  console.log("🔐 NEW NEUTRON WALLET GENERATED");
  console.log("=".repeat(80));
  console.log("");
  console.log("📋 Mnemonic (KEEP SECURE!):");
  console.log(mnemonic);
  console.log("");
  console.log("📍 Address:");
  console.log(account.address);
  console.log("");
  console.log("💰 Fund this address with NTRN tokens at:");
  console.log("   https://faucet.pion-1.ntrn.tech/");
  console.log("");
  console.log("🔧 Environment Variables:");
  console.log(`export MNEMONIC="${mnemonic}"`);
  console.log(`export NEUTRON_ADDRESS="${account.address}"`);
  console.log("");
  console.log("=".repeat(80));
  console.log("");
  console.log("⚠️  IMPORTANT SECURITY NOTES:");
  console.log("   - Never share your mnemonic with anyone");
  console.log("   - Store it securely offline");  
  console.log("   - This is for testnet only - DO NOT use for mainnet");
  console.log("   - Fund the address before running deployments");
  console.log("");
}

if (require.main === module) {
  generateWallet().catch(console.error);
}