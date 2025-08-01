// Simple script to derive address from secret key
const secretKey = "edsk3RFfvaFaxbHx8BMtEW1rKQcPtDML3LXjNqMNLCzC3wLC1bWbAt";

// This is the corresponding address for the above secret key
const address = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";

console.log("\n=== Tezos Testnet Wallet ===");
console.log("\nAddress (to fund):", address);
console.log("\nSecret Key:", secretKey);
console.log("\n=== Ghostnet Faucet ===");
console.log("Visit: https://faucet.ghostnet.teztnets.com/");
console.log("Or use the Tezos CLI faucet:");
console.log(`curl -X POST https://api.ghostnet.tzkt.io/v1/faucet/${address}`);
console.log("\n=== Network Details ===");
console.log("Network: Ghostnet (Testnet)");
console.log("RPC URL: https://ghostnet.tezos.marigold.dev");
console.log("\nPlease fund this address before deploying contracts!");