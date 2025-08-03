#!/usr/bin/env npx tsx
import { fundWallets } from "./fund_wallets";

console.log("💰 Starting wallet funding for all accounts...");

const config = {
  aptAmount: parseFloat(process.env.FUND_AMOUNT || "0.3"), // 0.5 APT per wallet
  mintTokens: process.env.SKIP_TOKENS !== "true", // Mint tokens unless explicitly skipped
  tokenAmount: 10000, // 10k tokens
};

console.log("Configuration:");
console.log("- APT per wallet:", config.aptAmount);
console.log("- Mint tokens:", config.mintTokens);
console.log("- Token amount:", config.tokenAmount);

fundWallets(config).catch((error) => {
  console.error("Failed to fund wallets:", error);
  process.exit(1);
});
