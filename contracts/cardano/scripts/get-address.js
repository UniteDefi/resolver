const { Lucid } = require("lucid-cardano");

async function getAddress() {
  try {
    const lucid = await Lucid.new(undefined, "Preprod");
    
    const privateKey = "382fd900dedcc3443f14ad760145e358c1d6dae8a6bf7ba8a93de7e68b0ff594";
    
    lucid.selectWalletFromPrivateKey(privateKey);
    
    const address = await lucid.wallet.address();
    
    console.log("\n=== CARDANO PREPROD WALLET ===");
    console.log("Address:", address);
    console.log("Private Key:", privateKey);
    console.log("\nPlease fund this address using the Cardano testnet faucet:");
    console.log("https://docs.cardano.org/cardano-testnet/tools/faucet/");
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

getAddress();