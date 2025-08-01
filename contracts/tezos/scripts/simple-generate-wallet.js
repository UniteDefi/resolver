const { InMemorySigner } = require("@taquito/signer");

async function generateWallet() {
  // Generate a new random key
  const signer = InMemorySigner.fromFundraiser(
    "",
    "",
    InMemorySigner.createRandomSigner()
  );
  
  const secretKey = await signer.secretKey();
  const publicKey = await signer.publicKey();
  const publicKeyHash = await signer.publicKeyHash();
  
  console.log("\n=== Tezos Testnet Wallet Generated ===");
  console.log("\nAddress (to fund):", publicKeyHash);
  console.log("\nSecret Key:", secretKey);
  console.log("\nPublic Key:", publicKey);
  console.log("\n=== Ghostnet Faucet ===");
  console.log("Visit: https://faucet.ghostnet.teztnets.com/");
  console.log("Enter the address above to receive testnet XTZ");
  console.log("\n=== IMPORTANT ===");
  console.log("Save the secret key securely!");
}

// Use the existing signer method to generate random key
InMemorySigner.createRandomSigner = function() {
  const mnemonic = [];
  const possible = "abcdefghijklmnopqrstuvwxyz";
  
  for (let i = 0; i < 15; i++) {
    let word = "";
    for (let j = 0; j < 5; j++) {
      word += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    mnemonic.push(word);
  }
  
  return mnemonic.join(" ");
};

generateWallet().catch(console.error);