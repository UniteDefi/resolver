import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Global test setup
beforeAll(() => {
  console.log('🚀 Starting Cross-Chain HTLC Tests');
  console.log('Environment: Testnet');
  console.log('EVM Chain: Base Sepolia (Chain ID: 84532)');
  console.log('XRPL Network: Testnet');
});

afterAll(() => {
  console.log('✅ Cross-Chain HTLC Tests Completed');
});
