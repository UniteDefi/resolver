import { config } from "dotenv";
import { existsSync } from "fs";

// Load environment variables
const envFile = ".env";
if (existsSync(envFile)) {
    config({ path: envFile });
} else {
    console.warn("⚠️  .env file not found - some tests may use default values");
}

// Global test configuration
global.console = {
    ...global.console,
    log: jest.fn((message) => {
        // Suppress verbose logs during tests unless VERBOSE=true
        if (process.env.VERBOSE === "true") {
            console.info(message);
        }
    }),
    warn: console.warn,
    error: console.error,
    info: console.info
};

// Mock external services if not available
if (!process.env.BASE_SEPOLIA_RPC_URL) {
    console.warn("ℹ️  No EVM RPC URL provided - EVM tests will be simulated");
}

if (!process.env.TONCENTER_API_KEY) {
    console.warn("ℹ️  No TON Center API key - using sandbox only");
}

// Test helpers
export const TEST_CONFIG = {
    VERBOSE: process.env.VERBOSE === "true",
    EVM_ENABLED: !!process.env.BASE_SEPOLIA_RPC_URL,
    TON_TESTNET_ENABLED: !!process.env.TONCENTER_API_KEY,
    TIMEOUT: {
        SHORT: 30000,
        MEDIUM: 60000,
        LONG: 120000
    }
};

console.log("🧪 Test environment configured");
console.log(`  EVM Tests: ${TEST_CONFIG.EVM_ENABLED ? "Real" : "Simulated"}`);
console.log(`  TON Tests: Sandbox + ${TEST_CONFIG.TON_TESTNET_ENABLED ? "Testnet" : "Local only"}`);
