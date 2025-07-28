#!/usr/bin/env node

const { Wallet } = require('ethers');
const crypto = require('crypto');

console.log('🔑 Generating Test Wallets for Deployment and Testing');
console.log('====================================================');

// Generate Ethereum wallets
console.log('\n📍 ETHEREUM/BASE SEPOLIA WALLETS:');
console.log('================================');

const ethWallets = [];
for (let i = 0; i < 5; i++) {
  const wallet = Wallet.createRandom();
  ethWallets.push(wallet);
  
  console.log(`\nWallet ${i + 1}:`);
  console.log(`  Address: ${wallet.address}`);
  console.log(`  Private Key: ${wallet.privateKey}`);
  
  if (i === 0) console.log('  Role: Relayer Service');
  else if (i === 1) console.log('  Role: Resolver 1');
  else if (i === 2) console.log('  Role: Resolver 2'); 
  else if (i === 3) console.log('  Role: Resolver 3');
  else console.log('  Role: Test User');
}

// Generate Aptos wallets (simplified - just private keys)
console.log('\n\n📍 APTOS WALLETS:');
console.log('=================');

const aptosWallets = [];
for (let i = 0; i < 5; i++) {
  const privateKey = crypto.randomBytes(32);
  const privateKeyHex = `0x${privateKey.toString('hex')}`;
  aptosWallets.push({ privateKey: privateKeyHex });
  
  console.log(`\nWallet ${i + 1}:`);
  console.log(`  Private Key: ${privateKeyHex}`);
  console.log(`  (Address will be generated when first used)`);
  
  if (i === 0) console.log('  Role: Relayer Service');
  else if (i === 1) console.log('  Role: Resolver 1');
  else if (i === 2) console.log('  Role: Resolver 2');
  else if (i === 3) console.log('  Role: Resolver 3');
  else console.log('  Role: Test User');
}

console.log('\n\n💰 FUNDING INSTRUCTIONS:');
console.log('========================');
console.log('\n🔹 Base Sepolia ETH Faucets:');
console.log('  • https://faucet.quicknode.com/base/sepolia');
console.log('  • https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet');

console.log('\n🔹 Aptos Testnet APT Faucets:');
console.log('  • https://aptoslabs.com/testnet-faucet');
console.log('  • Use Aptos CLI: aptos account fund-with-faucet --account <address>');

console.log('\n🔹 Minimum Required Funding:');
console.log('  • Relayer: 0.1 ETH (Base Sepolia) + 1 APT (Aptos)');
console.log('  • Each Resolver: 0.05 ETH + 0.5 APT');
console.log('  • Test User: 0.01 ETH + 0.1 APT');

console.log('\n📋 NEXT STEPS:');
console.log('==============');
console.log('1. Fund the above addresses using the faucets');
console.log('2. Wait for confirmations (1-2 minutes)');
console.log('3. Run deployment script: node scripts/deploy-contracts.js');
console.log('4. Run integration tests: npm test');

// Export for use in other scripts
module.exports = {
  ethWallets: ethWallets.map(w => ({ address: w.address, privateKey: w.privateKey })),
  aptosWallets: aptosWallets.map(w => ({ 
    privateKey: w.privateKey 
  }))
};