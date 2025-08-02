// Jest setup file
require('dotenv').config();

// Increase timeout for all tests
jest.setTimeout(120000);

// Global test setup
beforeAll(async () => {
  console.log('🧪 Starting StarkNet HTLC Tests');
  console.log('================================');
});

afterAll(async () => {
  console.log('✅ All tests completed');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
