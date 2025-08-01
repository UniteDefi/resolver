import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import * as fs from "fs";
import * as path from "path";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

function generateTestnetWallet(): void {
  console.log("[Generate Wallet] Creating Bitcoin testnet wallet...");
  
  // Generate new key pair
  const keyPair = ECPair.makeRandom({ network });
  
  // Generate different address types
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
  const p2pkh = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });
  const p2sh_p2wpkh = bitcoin.payments.p2sh({
    redeem: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network }),
    network,
  });
  
  const wif = keyPair.toWIF();
  const privateKeyHex = keyPair.privateKey!.toString("hex");
  const publicKeyHex = keyPair.publicKey.toString("hex");
  
  console.log("\n[Generate Wallet] Wallet Details:");
  console.log("=====================================");
  console.log("Network: Bitcoin Testnet");
  console.log("\nPrivate Key (WIF):", wif);
  console.log("Private Key (Hex):", privateKeyHex);
  console.log("Public Key (Hex):", publicKeyHex);
  console.log("\nAddresses:");
  console.log("- Native SegWit (P2WPKH):", p2wpkh.address);
  console.log("- Nested SegWit (P2SH-P2WPKH):", p2sh_p2wpkh.address);
  console.log("- Legacy (P2PKH):", p2pkh.address);
  console.log("=====================================");
  
  // Create .env file content
  const envContent = `# Bitcoin Testnet Configuration
BITCOIN_NETWORK=testnet

# Wallet Configuration
WALLET_WIF=${wif}
WALLET_PRIVATE_KEY=${privateKeyHex}
WALLET_PUBLIC_KEY=${publicKeyHex}

# Addresses
WALLET_ADDRESS_SEGWIT=${p2wpkh.address}
WALLET_ADDRESS_NESTED_SEGWIT=${p2sh_p2wpkh.address}
WALLET_ADDRESS_LEGACY=${p2pkh.address}

# Default address to use
WALLET_ADDRESS=${p2wpkh.address}

# HTLC Configuration
HTLC_PREIMAGE=mysecretpreimage1234567890123456
HTLC_TIMELOCK_DURATION=3600

# Testnet API Configuration (using Blockstream API)
TESTNET_API_URL=https://blockstream.info/testnet/api

# Transaction Configuration
TRANSACTION_FEE_RATE=10`;
  
  // Write to .env file
  const envPath = path.join(__dirname, "..", ".env");
  fs.writeFileSync(envPath, envContent);
  console.log("\n[Generate Wallet] Configuration saved to .env");
  
  console.log("\n[Generate Wallet] IMPORTANT - SAVE YOUR PRIVATE KEY!");
  console.log("This wallet has been generated for testnet use.");
  console.log("\nYou can fund this address with testnet Bitcoin:");
  console.log(`${p2wpkh.address}`);
  console.log("\nTestnet faucets:");
  console.log("- https://coinfaucet.eu/en/btc-testnet/");
  console.log("- https://testnet-faucet.mempool.co/");
  console.log("- https://bitcoinfaucet.uo1.net/");
}

generateTestnetWallet();