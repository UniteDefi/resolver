export const TEST_CHAINS = {
  APTOS_TESTNET: {
    id: 2,
    name: "Aptos Testnet",
    rpc: "https://fullnode.testnet.aptoslabs.com",
    faucet: "https://faucet.testnet.aptoslabs.com",
  },
  ETHEREUM_SEPOLIA: {
    id: 11155111,
    name: "Ethereum Sepolia",
    rpc: "https://eth-sepolia.g.alchemy.com/v2/demo",
  },
  POLYGON_MUMBAI: {
    id: 80001,
    name: "Polygon Mumbai",
    rpc: "https://rpc-mumbai.maticvigil.com",
  },
  BSC_TESTNET: {
    id: 97,
    name: "BSC Testnet",
    rpc: "https://data-seed-prebsc-1-s1.binance.org:8545",
  },
};

export const TEST_TOKENS = {
  APTOS: {
    APT: "0x1::aptos_coin::AptosCoin",
    USDT: "test_coin::USDT",
    DAI: "test_coin::DAI",
  },
  EVM: {
    ETH: "0x0000000000000000000000000000000000000000",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
};

export const TEST_AMOUNTS = {
  SMALL: BigInt("1000000"), // 1 token with 6 decimals
  MEDIUM: BigInt("1000000000"), // 1000 tokens with 6 decimals
  LARGE: BigInt("1000000000000"), // 1M tokens with 6 decimals
};

export const TEST_SECRETS = {
  SECRET_1: Buffer.from("test_secret_1_for_htlc_swap_demo", "utf8"),
  SECRET_2: Buffer.from("another_secret_for_testing_htlc2", "utf8"),
  SECRET_3: Buffer.from("third_secret_used_in_integration", "utf8"),
};

export const TEST_TIMELOCKS = {
  ONE_HOUR: 3600,
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
};

export function generateTestEscrowId(): Uint8Array {
  const id = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    id[i] = Math.floor(Math.random() * 256);
  }
  return id;
}

export function generateTestHashlock(secret: Uint8Array): Uint8Array {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(secret).digest();
}

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function getFutureTimestamp(seconds: number): number {
  return getCurrentTimestamp() + seconds;
}

export interface TestOrder {
  maker: string;
  taker: string;
  makerAsset: string;
  takerAsset: string;
  makerAmount: bigint;
  takerAmount: bigint;
  salt: bigint;
  expiry: number;
}

export function createTestOrder(
  maker: string,
  taker: string = "0x0",
  makerAsset: string = TEST_TOKENS.APTOS.APT,
  takerAsset: string = TEST_TOKENS.APTOS.USDT,
  makerAmount: bigint = TEST_AMOUNTS.MEDIUM,
  takerAmount: bigint = TEST_AMOUNTS.MEDIUM
): TestOrder {
  return {
    maker,
    taker,
    makerAsset,
    takerAsset,
    makerAmount,
    takerAmount,
    salt: BigInt(Date.now()),
    expiry: getFutureTimestamp(TEST_TIMELOCKS.ONE_DAY),
  };
}

export interface TestEscrow {
  srcAddress: string;
  dstAddress: string;
  srcToken: string;
  srcAmount: bigint;
  dstChainId: number;
  dstToken: string;
  dstAmount: bigint;
  hashlock: Uint8Array;
  timelock: number;
  escrowId: Uint8Array;
}

export function createTestEscrow(
  srcAddress: string,
  dstAddress: string,
  srcChainId: number = TEST_CHAINS.APTOS_TESTNET.id,
  dstChainId: number = TEST_CHAINS.ETHEREUM_SEPOLIA.id
): TestEscrow {
  const secret = TEST_SECRETS.SECRET_1;
  const hashlock = generateTestHashlock(secret);
  
  return {
    srcAddress,
    dstAddress,
    srcToken: TEST_TOKENS.APTOS.APT,
    srcAmount: TEST_AMOUNTS.MEDIUM,
    dstChainId,
    dstToken: TEST_TOKENS.EVM.USDT,
    dstAmount: TEST_AMOUNTS.MEDIUM,
    hashlock,
    timelock: getFutureTimestamp(TEST_TIMELOCKS.ONE_HOUR),
    escrowId: generateTestEscrowId(),
  };
}

export const RESOLVER_CONFIGS = {
  LOW_FEE: {
    name: "LowFeeResolver",
    feeBps: 10, // 0.1%
  },
  STANDARD_FEE: {
    name: "StandardResolver",
    feeBps: 50, // 0.5%
  },
  HIGH_FEE: {
    name: "PremiumResolver",
    feeBps: 100, // 1%
  },
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatAddress(address: string, length: number = 6): string {
  return `${address.slice(0, length)}...${address.slice(-4)}`;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}