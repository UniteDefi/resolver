import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import dotenv from "dotenv";

dotenv.config();

function getAccountInfo() {
  const privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ APTOS_PRIVATE_KEY not found in environment variables");
    console.log("Please set APTOS_PRIVATE_KEY in your .env file");
    process.exit(1);
  }

  try {
    const account = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey),
    });

    const network = process.env.APTOS_NETWORK || "devnet";
    
    console.log("🔑 Aptos Account Information");
    console.log("==========================================");
    console.log("Address:", account.accountAddress.toString());
    console.log("Public Key:", account.publicKey.toString());
    console.log("Network:", network);
    console.log("==========================================");
    
    // Generate explorer link
    const explorerUrl = network === "mainnet" 
      ? `https://explorer.aptoslabs.com/account/${account.accountAddress.toString()}`
      : `https://explorer.aptoslabs.com/account/${account.accountAddress.toString()}?network=${network}`;
    
    console.log("Explorer:", explorerUrl);
    
    // Output just the address if --address flag is used
    if (process.argv.includes('--address')) {
      console.log(account.accountAddress.toString());
      return;
    }
    
    // Provide funding instructions for testnets
    if (network === "devnet" || network === "testnet") {
      console.log("\n💰 Funding Instructions:");
      console.log(`Visit the Aptos Faucet: https://aptoslabs.com/testnet-faucet`);
      console.log(`Or use CLI: aptos account fund-with-faucet --account ${account.accountAddress.toString()}`);
    }
    
  } catch (error: any) {
    console.error("❌ Error processing private key:", error.message);
    console.log("Please ensure APTOS_PRIVATE_KEY is a valid 64-character hex string");
    process.exit(1);
  }
}

// Generate new account if --generate flag is used
if (process.argv.includes('--generate')) {
  console.log("🎲 Generating new Aptos account...");
  console.log("==========================================");
  
  const newAccount = Account.generate();
  console.log("Address:", newAccount.accountAddress.toString());
  console.log("Private Key:", newAccount.privateKey.toString());
  console.log("Public Key:", newAccount.publicKey.toString());
  console.log("==========================================");
  console.log("⚠️  Save the private key securely!");
  console.log("Add to your .env file:");
  console.log(`APTOS_PRIVATE_KEY=${newAccount.privateKey.toString()}`);
} else {
  getAccountInfo();
}