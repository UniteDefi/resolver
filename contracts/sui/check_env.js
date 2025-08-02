#!/usr/bin/env node

/**
 * Environment Configuration Checker
 * Run this before running cross-chain tests to verify setup
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const requiredVars = {
  'SUI Network': [
    'SUI_RPC_URL',
    'PRIVATE_KEY',
    'SUI_RESOLVER_PRIVATE_KEY_0',
    'SUI_RESOLVER_PRIVATE_KEY_1'
  ],
  'Base Sepolia Network': [
    'BASE_SEPOLIA_RPC_URL',
    'TEST_USER_PRIVATE_KEY',
    'RESOLVER_PRIVATE_KEY_0',
    'RESOLVER_PRIVATE_KEY_1',
    'DEPLOYER_PRIVATE_KEY'
  ]
};

console.log('🔍 Environment Configuration Check\n');

let allGood = true;

// Check environment variables
for (const [category, vars] of Object.entries(requiredVars)) {
  console.log(`📋 ${category}:`);
  
  for (const varName of vars) {
    const value = process.env[varName];
    if (value && value !== 'your_private_key_here' && value !== 'your_base_sepolia_rpc_url_here') {
      console.log(`  ✅ ${varName}`);
    } else {
      console.log(`  ❌ ${varName} - Missing or not set`);
      allGood = false;
    }
  }
  console.log('');
}

// Check deployments.json file
console.log('📋 Contract Deployments:');
const deploymentsPath = path.join(__dirname, 'deployments.json');

if (fs.existsSync(deploymentsPath)) {
  try {
    const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf-8'));
    
    // Check Sui deployments
    if (deployments.sui?.testnet?.packageId) {
      console.log(`  ✅ Sui Testnet Package: ${deployments.sui.testnet.packageId}`);
    } else {
      console.log(`  ❌ Sui Testnet deployments missing`);
      allGood = false;
    }
    
    // Check Base Sepolia deployments
    if (deployments.evm?.base_sepolia?.UniteEscrowFactory) {
      console.log(`  ✅ Base Sepolia Factory: ${deployments.evm.base_sepolia.UniteEscrowFactory}`);
    } else {
      console.log(`  ❌ Base Sepolia deployments missing`);
      allGood = false;
    }
    
  } catch (error) {
    console.log(`  ❌ deployments.json - Invalid JSON format`);
    allGood = false;
  }
} else {
  console.log(`  ❌ deployments.json - File not found`);
  allGood = false;
}

console.log('');

if (allGood) {
  console.log('🎉 All configurations are ready!');
  console.log('📋 You can now run: npm run test:cross-chain');
} else {
  console.log('❌ Some configurations are missing.');
  console.log('📝 Please check:');
  console.log('   1. Update your .env file with missing private keys');
  console.log('   2. Ensure deployments.json exists with contract addresses');
  console.log('   3. Fund your wallets with ETH/SUI and test tokens');
  process.exit(1);
}