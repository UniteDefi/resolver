// Mock contract addresses for testing (when actual deployments aren't available)
export const MOCK_CONTRACTS = {
  base_sepolia: {
    UniteLimitOrderProtocol: "0x1234567890123456789012345678901234567890",
    UniteEscrowFactory: "0x2345678901234567890123456789012345678901", 
    UniteResolver0: "0x3456789012345678901234567890123456789012",
    UniteResolver1: "0x4567890123456789012345678901234567890123",
    UniteResolver2: "0x5678901234567890123456789012345678901234",
    MockUSDT: "0x97a2d8Dfece96252518a4327aFFf40B61A0a025A", // Real testnet address
    MockDAI: "0x6789012345678901234567890123456789012345",
    MockWrappedNative: "0x7890123456789012345678901234567890123456"
  }
};

export const TESTNET_CONFIG = {
  xrpl: {
    serverUrl: "wss://s.altnet.rippletest.net:51233",
    networkId: 0,
    faucetUrl: "https://xrpl.org/xrp-testnet-faucet.html"
  },
  evm: {
    base_sepolia: {
      rpcUrl: "https://sepolia.base.org",
      chainId: 84532,
      faucetUrl: "https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
    }
  }
};
