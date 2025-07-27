import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  near: {
    networkId: "testnet",
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    explorerUrl: "https://explorer.testnet.near.org",
    accountId: process.env.NEAR_ACCOUNT_ID || "test.testnet",
    privateKey: process.env.NEAR_PRIVATE_KEY || "",
    contractName: process.env.NEAR_CONTRACT_NAME || "unite-htlc.testnet",
  },
  base: {
    rpcUrl: "https://sepolia.base.org",
    chainId: 84532,
    privateKey: process.env.BASE_PRIVATE_KEY || "",
    escrowAddress: process.env.BASE_ESCROW_ADDRESS || "",
  },
  test: {
    defaultTimeout: 300000, // 5 minutes
    htlcTimeout: 3600, // 1 hour in seconds
    safetyDeposit: "1000000000000000000000", // 0.001 NEAR
  },
};