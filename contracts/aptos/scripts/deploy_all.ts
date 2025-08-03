#!/usr/bin/env npx tsx
import { deployUniteProtocol } from './deploy';

console.log("🚀 Starting complete Aptos deployment...");

async function main() {
  try {
    await deployUniteProtocol();
    console.log("✅ Deployment completed successfully!");
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

main();