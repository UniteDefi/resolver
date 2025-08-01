import { Wallet } from "xrpl";
import fs from "fs";
import path from "path";

function generateWallets() {
  console.log("[GenerateWallets] Generating XRP testnet wallets...\n");
  
  // Generate two wallets
  const sourceWallet = Wallet.generate();
  const destinationWallet = Wallet.generate();
  
  console.log("Source Wallet (Escrow Creator):");
  console.log("Address:", sourceWallet.address);
  console.log("Secret:", sourceWallet.seed);
  console.log("");
  
  console.log("Destination Wallet (Escrow Receiver):");
  console.log("Address:", destinationWallet.address);
  console.log("Secret:", destinationWallet.seed);
  console.log("");
  
  // Create .env content
  const envContent = `# XRP Ledger Configuration
# Use testnet for development: wss://s.altnet.rippletest.net:51233
# Use mainnet for production: wss://xrplcluster.com
XRP_SERVER_URL=wss://s.altnet.rippletest.net:51233

# Source Account (Escrow Creator)
# Get test XRP from: https://xrpl.org/xrp-testnet-faucet.html
XRP_SOURCE_ADDRESS=${sourceWallet.address}
XRP_SOURCE_SECRET=${sourceWallet.seed}

# Destination Account (Escrow Receiver)
# Generate using: https://xrpl.org/xrp-testnet-faucet.html
XRP_DESTINATION_ADDRESS=${destinationWallet.address}
XRP_DESTINATION_SECRET=${destinationWallet.seed}

# Optional: Custom server configuration
# XRP_NETWORK=testnet # Options: testnet, mainnet, devnet
# XRP_SERVER_TIMEOUT=20000 # Connection timeout in milliseconds
`;
  
  // Write to .env file
  const envPath = path.join(__dirname, "..", ".env");
  fs.writeFileSync(envPath, envContent);
  
  console.log("✅ Generated wallets and created .env file");
  console.log("\n🚰 Please fund these addresses using the XRP Testnet Faucet:");
  console.log("https://xrpl.org/xrp-testnet-faucet.html");
  console.log("\nFund both addresses:");
  console.log(`1. ${sourceWallet.address}`);
  console.log(`2. ${destinationWallet.address}`);
}

generateWallets();