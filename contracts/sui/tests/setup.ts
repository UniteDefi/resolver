/**
 * Simple test setup for cross-chain tests
 * Removed problematic imports to make tests self-contained
 */

export const TEST_CONFIG = {
  timeout: 300000, // 5 minutes
  networks: {
    sui: {
      rpc: process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io",
      network: "testnet"
    },
    baseSepolia: {
      rpc: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532
    }
  }
};

export function setupTests(): void {
  // Simple setup without external dependencies
  console.log("🔧 Test setup initialized");
  
  // Verify required environment variables
  const requiredVars = [
    'SUI_RPC_URL',
    'BASE_SEPOLIA_RPC_URL',
    'PRIVATE_KEY'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.warn("⚠️ Missing environment variables:", missing);
  }
}

// Set longer timeout for cross-chain operations
jest.setTimeout(300000);