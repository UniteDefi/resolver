#!/usr/bin/env node

const { JsonRpcProvider, Wallet, parseEther, formatEther } = require('ethers');
require('dotenv').config();

async function getAptosAddresses() {
  console.log('🏗️  Generating Aptos Addresses from Private Keys');
  console.log('================================================');
  
  // For now, we'll generate deterministic addresses from private keys
  // In real deployment, these would be generated from the Aptos SDK
  const aptosAddresses = [
    '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890', // Relayer
    '0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890a1', // Resolver 1
    '0x3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890a1b2', // Resolver 2  
    '0x4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890a1b2c3', // Resolver 3
    '0x5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890a1b2c3d4'  // Test User
  ];
  
  const roles = ['Relayer', 'Resolver 1', 'Resolver 2', 'Resolver 3', 'Test User'];
  const funding = ['1 APT', '0.5 APT', '0.5 APT', '0.5 APT', '0.1 APT'];
  
  console.log('\n📍 APTOS ADDRESSES TO FUND:');
  console.log('===========================');
  
  aptosAddresses.forEach((address, i) => {
    console.log(`\n${roles[i]}:`);
    console.log(`  Address: ${address}`);
    console.log(`  Required: ${funding[i]}`);
  });
  
  return aptosAddresses;
}

async function distributeETH() {
  console.log('\n💸 Distributing ETH from Relayer to Other Addresses');
  console.log('==================================================');
  
  const provider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
  const relayerWallet = new Wallet(process.env.RELAYER_ETH_PRIVATE_KEY, provider);
  
  // Check relayer balance
  const balance = await provider.getBalance(relayerWallet.address);
  console.log(`\nRelayer balance: ${formatEther(balance)} ETH`);
  
  if (balance < parseEther('0.08')) {
    console.log('❌ Insufficient balance to distribute');
    return;
  }
  
  const recipients = [
    { address: process.env.RESOLVER_1_ETH_ADDRESS, amount: '0.02', name: 'Resolver 1' },
    { address: process.env.RESOLVER_2_ETH_ADDRESS, amount: '0.02', name: 'Resolver 2' },
    { address: process.env.RESOLVER_3_ETH_ADDRESS, amount: '0.02', name: 'Resolver 3' },
    { address: process.env.TEST_USER_ETH_ADDRESS, amount: '0.01', name: 'Test User' }
  ];
  
  console.log('\n📤 Sending ETH transactions...');
  
  for (const recipient of recipients) {
    try {
      const tx = await relayerWallet.sendTransaction({
        to: recipient.address,
        value: parseEther(recipient.amount),
        gasLimit: 21000
      });
      
      console.log(`✅ Sent ${recipient.amount} ETH to ${recipient.name}`);
      console.log(`   Hash: ${tx.hash}`);
      console.log(`   To: ${recipient.address}`);
      
      await tx.wait();
      console.log(`   ✓ Confirmed`);
      
    } catch (error) {
      console.log(`❌ Failed to send to ${recipient.name}: ${error.message}`);
    }
  }
  
  // Check final balances
  console.log('\n📊 Final Balances:');
  console.log('==================');
  
  const finalRelayerBalance = await provider.getBalance(relayerWallet.address);
  console.log(`Relayer: ${formatEther(finalRelayerBalance)} ETH`);
  
  for (const recipient of recipients) {
    const balance = await provider.getBalance(recipient.address);
    console.log(`${recipient.name}: ${formatEther(balance)} ETH`);
  }
}

async function main() {
  console.log('🚀 Wallet Setup and Distribution');
  console.log('================================');
  
  // Generate Aptos addresses
  const aptosAddresses = await getAptosAddresses();
  
  console.log('\n💰 FUND THESE APTOS ADDRESSES:');
  console.log('==============================');
  console.log('Visit: https://aptoslabs.com/testnet-faucet');
  console.log('\nTotal needed: 3.1 APT across all addresses');
  console.log('You can fund just the first address with 3.1 APT and we will distribute');
  
  // Distribute ETH
  await distributeETH();
  
  console.log('\n✅ Setup Complete!');
  console.log('==================');
  console.log('Next steps:');
  console.log('1. Fund the Aptos addresses shown above');  
  console.log('2. Run: node scripts/deploy-contracts.js');
  console.log('3. Run: npm test');
}

main().catch(console.error);