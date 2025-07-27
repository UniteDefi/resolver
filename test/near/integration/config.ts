import * as dotenv from "dotenv";
dotenv.config();

export const NEAR_CONFIG = {
  networkId: "testnet",
  nodeUrl: process.env.NEAR_NODE_URL || "https://rpc.testnet.near.org",
  walletUrl: "https://wallet.testnet.near.org",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://explorer.testnet.near.org",
  contractName: process.env.NEAR_ACCOUNT_ID || "test.testnet",
};

export const BASE_CONFIG = {
  rpcUrl: process.env.BASE_RPC_URL || "https://sepolia.base.org",
  chainId: 84532,
};

export const TEST_CONFIG = {
  defaultTimeout: 300000, // 5 minutes
  htlcTimeout: 3600, // 1 hour in seconds
  safetyDeposit: "1000000000000000000000", // 0.001 NEAR
};

export const config = {
  near: NEAR_CONFIG,
  base: BASE_CONFIG,
  test: TEST_CONFIG,
};