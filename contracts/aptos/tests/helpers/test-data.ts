import { randomBytes } from "crypto";
import { solidityPackedKeccak256, hexlify, parseUnits } from "ethers";
import { encodeTimelocks, type Immutables } from "./aptos-helpers";
import { encodeEvmTimelocks, type EVMImmutables, type Order } from "./evm-helpers";

export interface TestScenario {
  name: string;
  description: string;
  sourceChain: "base_sepolia" | "arb_sepolia" | "aptos";
  destinationChain: "base_sepolia" | "arb_sepolia" | "aptos";
  sourceToken: string;
  destinationToken: string;
  amount: string;
  expectedAmount: string;
  safetyDepositRate: number; // percentage
}

export interface CrossChainTestData {
  secret: Uint8Array;
  hashlock: string;
  orderHash: string;
  timelocks: {
    srcWithdrawal: number;
    srcPublicWithdrawal: number;
    srcCancellation: number;
    srcPublicCancellation: number;
    dstWithdrawal: number;
    dstPublicWithdrawal: number;
    dstCancellation: number;
  };
  resolverCommitments: {
    resolver1: string;
    resolver2: string;
    resolver3: string;
  };
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    name: "Base Sepolia to Aptos USDT→DAI",
    description: "Swap 100 USDT on Base Sepolia for 99 DAI on Aptos",
    sourceChain: "base_sepolia",
    destinationChain: "aptos",
    sourceToken: "USDT",
    destinationToken: "DAI",
    amount: "100",
    expectedAmount: "99",
    safetyDepositRate: 0.1,
  },
  {
    name: "Aptos to Base Sepolia DAI→USDT",
    description: "Swap 100 DAI on Aptos for 101 USDT on Base Sepolia",
    sourceChain: "aptos",
    destinationChain: "base_sepolia",
    sourceToken: "DAI",
    destinationToken: "USDT",
    amount: "100",
    expectedAmount: "101",
    safetyDepositRate: 0.1,
  },
  {
    name: "Arbitrum to Aptos USDT→DAI",
    description: "Swap 50 USDT on Arbitrum Sepolia for 49.5 DAI on Aptos",
    sourceChain: "arb_sepolia",
    destinationChain: "aptos",
    sourceToken: "USDT",
    destinationToken: "DAI",
    amount: "50",
    expectedAmount: "49.5",
    safetyDepositRate: 0.1,
  },
];

export function generateTestSecret(): { secret: Uint8Array; hashlock: string } {
  const secret = randomBytes(32);
  const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
  return { secret, hashlock };
}

export function generateTestOrderHash(): string {
  return solidityPackedKeccak256(
    ["uint256", "address", "uint256", "uint256"],
    [Date.now(), "0x1234567890123456789012345678901234567890", Date.now(), 12345]
  );
}

export function getStandardTimelocks() {
  return {
    srcWithdrawal: 0,           // Immediate withdrawal with secret
    srcPublicWithdrawal: 900,   // 15 min for public reward incentive
    srcCancellation: 1800,      // 30 min for cancellation
    srcPublicCancellation: 3600, // 1 hour for public cancellation
    dstWithdrawal: 0,           // Immediate withdrawal with secret
    dstPublicWithdrawal: 900,   // 15 min for public reward incentive
    dstCancellation: 2700       // 45 min for destination cancellation
  };
}

export function createTestData(scenario: TestScenario): CrossChainTestData {
  const { secret, hashlock } = generateTestSecret();
  const orderHash = generateTestOrderHash();
  const timelocks = getStandardTimelocks();
  
  // Calculate resolver commitments (split the amount proportionally)
  const totalAmount = parseFloat(scenario.amount);
  const resolverCommitments = {
    resolver1: (totalAmount * 0.4).toString(), // 40%
    resolver2: (totalAmount * 0.35).toString(), // 35%
    resolver3: (totalAmount * 0.25).toString(), // 25%
  };

  return {
    secret,
    hashlock,
    orderHash,
    timelocks,
    resolverCommitments,
  };
}

export function createAptosImmutables(
  testData: CrossChainTestData,
  scenario: TestScenario,
  maker: string,
  packageAddress: string
): Immutables {
  const orderHashBytes = Array.from(Buffer.from(testData.orderHash.slice(2), 'hex'));
  const hashlockBytes = Array.from(Buffer.from(testData.hashlock.slice(2), 'hex'));
  
  // Get token decimals
  const decimals = scenario.sourceToken === "USDT" ? 6 : 18;
  const amount = parseUnits(scenario.amount, decimals).toString();
  const safetyDeposit = parseUnits((parseFloat(scenario.amount) * scenario.safetyDepositRate / 100).toString(), 18).toString();
  
  const timelocks = encodeTimelocks(testData.timelocks);

  return {
    order_hash: orderHashBytes,
    hashlock: hashlockBytes,
    maker,
    taker: "0x0",
    token: packageAddress,
    amount: { value: BigInt(amount) } as any,
    safety_deposit: { value: BigInt(safetyDeposit) } as any,
    timelocks: { value: BigInt(timelocks) } as any,
  };
}

export function createEvmImmutables(
  testData: CrossChainTestData,
  scenario: TestScenario,
  maker: string,
  tokenAddress: string
): EVMImmutables {
  // Get token decimals
  const decimals = scenario.sourceToken === "USDT" ? 6 : 18;
  const amount = parseUnits(scenario.amount, decimals);
  const safetyDeposit = parseUnits((parseFloat(scenario.amount) * scenario.safetyDepositRate / 100).toString(), 18);
  
  const timelocks = encodeEvmTimelocks({
    srcWithdrawal: BigInt(testData.timelocks.srcWithdrawal),
    srcPublicWithdrawal: BigInt(testData.timelocks.srcPublicWithdrawal),
    srcCancellation: BigInt(testData.timelocks.srcCancellation),
    srcPublicCancellation: BigInt(testData.timelocks.srcPublicCancellation),
    dstWithdrawal: BigInt(testData.timelocks.dstWithdrawal),
    dstPublicWithdrawal: BigInt(testData.timelocks.dstPublicWithdrawal),
    dstCancellation: BigInt(testData.timelocks.dstCancellation),
  });

  return {
    orderHash: testData.orderHash,
    hashlock: testData.hashlock,
    maker: BigInt(maker),
    taker: 0n,
    token: BigInt(tokenAddress),
    amount,
    safetyDeposit,
    timelocks,
  };
}

export function createTestOrder(
  testData: CrossChainTestData,
  scenario: TestScenario,
  maker: string,
  makerAsset: string,
  takerAsset: string,
  srcChainId: number,
  dstChainId: number,
  nonce: bigint = 0n
): Order {
  const now = Math.floor(Date.now() / 1000);
  const sourceDecimals = scenario.sourceToken === "USDT" ? 6 : 18;
  const destDecimals = scenario.destinationToken === "USDT" ? 6 : 18;
  
  return {
    salt: 12345n,
    maker,
    receiver: "0x0000000000000000000000000000000000000000",
    makerAsset,
    takerAsset,
    makingAmount: parseUnits(scenario.amount, sourceDecimals),
    takingAmount: parseUnits(scenario.expectedAmount, destDecimals),
    deadline: now + 3600,
    nonce,
    srcChainId,
    dstChainId,
    auctionStartTime: now,
    auctionEndTime: now + 300,
    startPrice: parseUnits("0.99", 18),
    endPrice: parseUnits("0.97", 18),
  };
}

export const CHAIN_IDS = {
  base_sepolia: 84532,
  arb_sepolia: 421614,
  eth_sepolia: 11155111,
  aptos_devnet: 3,
  aptos_testnet: 2,
  aptos_mainnet: 1,
} as const;

export const TOKEN_DECIMALS = {
  USDT: 6,
  DAI: 18,
  ETH: 18,
  APT: 8,
} as const;

export function formatTestAmount(amount: string, token: keyof typeof TOKEN_DECIMALS): string {
  const decimals = TOKEN_DECIMALS[token];
  return parseUnits(amount, decimals).toString();
}

export function parseTestAmount(amount: string, token: keyof typeof TOKEN_DECIMALS): string {
  const decimals = TOKEN_DECIMALS[token];
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const wholePart = num / divisor;
  const fractionalPart = num % divisor;
  
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${wholePart}.${fractionalStr}`.replace(/\.?0+$/, '');
}

export function logTestProgress(step: string, details?: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${step}${details ? `: ${details}` : ''}`);
}

export function validateTestScenario(scenario: TestScenario): boolean {
  const validChains = ["base_sepolia", "arb_sepolia", "aptos"];
  const validTokens = ["USDT", "DAI"];
  
  return (
    validChains.includes(scenario.sourceChain) &&
    validChains.includes(scenario.destinationChain) &&
    validTokens.includes(scenario.sourceToken) &&
    validTokens.includes(scenario.destinationToken) &&
    scenario.sourceChain !== scenario.destinationChain &&
    parseFloat(scenario.amount) > 0 &&
    parseFloat(scenario.expectedAmount) > 0 &&
    scenario.safetyDepositRate >= 0 && scenario.safetyDepositRate <= 100
  );
}