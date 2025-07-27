export const APTOS_CONFIG = {
  network: "testnet",
  nodeUrl: "https://fullnode.testnet.aptoslabs.com/v1",
  faucetUrl: "https://faucet.testnet.aptoslabs.com",
  indexerUrl: "https://indexer-testnet.staging.gcp.aptosdev.com/v1/graphql",
  
  // Module addresses (to be updated after deployment)
  moduleAddress: "0x1",
  
  // Chain IDs for cross-chain
  aptosChainId: 2, // Aptos testnet
  baseSepoliaChainId: 84532,
  
  // Gas settings
  maxGasAmount: 100000,
  gasUnitPrice: 100,
  
  // HTLC timeouts (in seconds)
  timeouts: {
    withdrawalDeadline: 3600,        // 1 hour
    publicWithdrawalDeadline: 7200,  // 2 hours
    cancellationDeadline: 10800,     // 3 hours
    publicCancellationDeadline: 14400, // 4 hours
  },
  
  // Safety deposit
  safetyDepositAmount: 1000000, // 0.01 APT
};

export const BASE_SEPOLIA_CONFIG = {
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  escrowFactoryAddress: process.env.BASE_ESCROW_FACTORY || "",
  dutchAuctionAddress: process.env.BASE_DUTCH_AUCTION || "",
};