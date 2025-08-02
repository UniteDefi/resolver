import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000, // 2 minutes for cross-chain tests
    hookTimeout: 60000,  // 1 minute for setup
    teardownTimeout: 30000,
    includeSource: ['**/*.{js,ts}'],
    exclude: [
      '**/node_modules/**',
      '**/build/**',
      '**/dist/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@tests': path.resolve(__dirname, './tests'),
      '@scripts': path.resolve(__dirname, './scripts'),
    },
  },
  define: {
    global: 'globalThis',
  },
});