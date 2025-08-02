#!/usr/bin/env tsx

/**
 * Cross-Chain Test Runner
 * 
 * This script runs the Aptos ↔ Base Sepolia cross-chain swap tests
 * 
 * Usage:
 *   npm run test:crosschain
 *   or
 *   npx tsx run-crosschain-test.ts
 */

import { execSync } from "child_process";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

function checkEnvironmentVariables() {
  console.log("🔍 Checking environment variables...\n");
  
  const requiredVars = [
    // Aptos keys
    'APTOS_PRIVATE_KEY',
    'APTOS_USER_PRIVATE_KEY', 
    'APTOS_RESOLVER_PRIVATE_KEY_0',
    'APTOS_RESOLVER_PRIVATE_KEY_1',
    
    // Base Sepolia keys
    'BASE_SEPOLIA_RPC_URL',
    'TEST_USER_PRIVATE_KEY',
    'RESOLVER_PRIVATE_KEY_0',
    'RESOLVER_PRIVATE_KEY_1',
    'DEPLOYER_PRIVATE_KEY'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error("❌ Missing required environment variables:");
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error("\nPlease check your .env file and ensure all required variables are set.");
    process.exit(1);
  }
  
  console.log("✅ All required environment variables are set");
}

function checkDeployments() {
  console.log("\n🔍 Checking deployments.json...");
  
  const deploymentsPath = path.join(__dirname, "deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    console.error("❌ deployments.json not found");
    console.error("Please ensure deployments.json exists with both EVM and Aptos deployments");
    process.exit(1);
  }
  
  try {
    const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    
    // Check EVM deployments
    if (!deployments.evm?.base_sepolia) {
      console.error("❌ Base Sepolia deployments not found in deployments.json");
      process.exit(1);
    }
    
    // Check Aptos deployments
    if (!deployments.aptos?.testnet) {
      console.error("❌ Aptos testnet deployments not found in deployments.json");
      console.error("Please add the Aptos deployment section to deployments.json");
      process.exit(1);
    }
    
    console.log("✅ Deployments found:");
    console.log(`   - Base Sepolia: ${deployments.evm.base_sepolia.name}`);
    console.log(`   - Aptos Testnet: ${deployments.aptos.testnet.name}`);
    console.log(`   - Aptos Package: ${deployments.aptos.testnet.packageAddress}`);
    
  } catch (error) {
    console.error("❌ Error reading deployments.json:", error);
    process.exit(1);
  }
}

function runTests() {
  console.log("\n🚀 Running cross-chain tests...\n");
  
  try {
    // Run the specific test file
    execSync(
      'npx vitest run tests/aptos-evm-crosschain.test.ts --reporter=verbose', 
      { 
        stdio: 'inherit',
        cwd: __dirname
      }
    );
    
    console.log("\n✅ Cross-chain tests completed successfully!");
    
  } catch (error) {
    console.error("\n❌ Tests failed:", error);
    process.exit(1);
  }
}

function main() {
  console.log("🌉 Unite Protocol - Aptos ↔ Base Sepolia Cross-Chain Test Runner");
  console.log("================================================================\n");
  
  checkEnvironmentVariables();
  checkDeployments();
  runTests();
}

if (require.main === module) {
  main();
}

export { checkEnvironmentVariables, checkDeployments, runTests };