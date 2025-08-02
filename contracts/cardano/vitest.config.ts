import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120000, // 2 minutes for cross-chain tests
    hookTimeout: 60000,  // 1 minute for setup/teardown
    globals: true
  }
});
