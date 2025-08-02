import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  solidityPackedKeccak256,
  getBytes,
  hexlify,
  TypedDataDomain,
  TypedDataField,
} from "ethers";

// Contract ABIs
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export const ESCROW_FACTORY_ABI = [
  "function createSrcEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 partialAmount, address resolver) external payable returns (address)",
  "function createDstEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp, uint256 partialAmount, address resolver) external payable returns (address)",
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function getTotalFilledAmount(bytes32 orderHash) external view returns (uint256)",
  "function transferUserFunds(bytes32 orderHash, address from, address token, uint256 amount) external",
];

export const UNITE_RESOLVER_ABI = [
  "function deploySrcCompactPartial(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order, bytes32 r, bytes32 vs, uint256 amount, uint256 partialAmount) external payable",
];

export const ESCROW_ABI = [
  "function withdrawWithSecret(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
  "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
];

export const LIMIT_ORDER_PROTOCOL_ABI = [
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order) external view returns (bytes32)",
  "function nonces(address) external view returns (uint256)",
  "function getFilledAmount(bytes32 orderHash) external view returns (uint256)",
  "function getEscrowAddress(bytes32 orderHash) external view returns (address)",
];

export interface EVMTestConfig {
  provider: JsonRpcProvider;
  user: Wallet;
  resolvers: Wallet[];
  deployments: any;
  chainId: number;
}

export interface Order {
  salt: bigint;
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: bigint;
  takingAmount: bigint;
  deadline: number;
  nonce: bigint;
  srcChainId: number;
  dstChainId: number;
  auctionStartTime: number;
  auctionEndTime: number;
  startPrice: bigint;
  endPrice: bigint;
}

export interface EVMImmutables {
  orderHash: string;
  hashlock: string;
  maker: bigint;
  taker: bigint;
  token: bigint;
  amount: bigint;
  safetyDeposit: bigint;
  timelocks: bigint;
}

export function setupEVMTest(
  rpcUrl: string,
  privateKey: string,
  resolverKeys: string[],
  deployments: any
): EVMTestConfig {
  const provider = new JsonRpcProvider(rpcUrl);
  const user = new Wallet(privateKey, provider);
  const resolvers = resolverKeys.map(key => new Wallet(key, provider));
  
  return {
    provider,
    user,
    resolvers,
    deployments,
    chainId: deployments.chainId,
  };
}

export async function signOrder(
  order: Order,
  signer: Wallet,
  contractName: string,
  version: string,
  chainId: number,
  verifyingContract: string
): Promise<{ r: string, vs: string }> {
  const domain: TypedDataDomain = {
    name: contractName,
    version: version,
    chainId: chainId,
    verifyingContract: verifyingContract
  };

  const types: Record<string, Array<TypedDataField>> = {
    Order: [
      { name: "salt", type: "uint256" },
      { name: "maker", type: "address" },
      { name: "receiver", type: "address" },
      { name: "makerAsset", type: "address" },
      { name: "takerAsset", type: "address" },
      { name: "makingAmount", type: "uint256" },
      { name: "takingAmount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "srcChainId", type: "uint256" },
      { name: "dstChainId", type: "uint256" },
      { name: "auctionStartTime", type: "uint256" },
      { name: "auctionEndTime", type: "uint256" },
      { name: "startPrice", type: "uint256" },
      { name: "endPrice", type: "uint256" }
    ]
  };

  const signature = await signer.signTypedData(domain, types, order);
  const sig = getBytes(signature);
  
  const r = hexlify(sig.slice(0, 32));
  const s = hexlify(sig.slice(32, 64));
  const v = sig[64];
  
  const vBit = v - 27;
  let sBytes = getBytes(s);
  if (vBit === 1) {
    sBytes[0] |= 0x80;
  }
  const vs = hexlify(sBytes);

  return { r, vs };
}

export function encodeEvmTimelocks(timelocks: Record<string, bigint>): bigint {
  let encoded = 0n;
  encoded |= (timelocks.srcWithdrawal & 0xFFFFFFFFn);
  encoded |= (timelocks.srcPublicWithdrawal & 0xFFFFFFFFn) << 32n;
  encoded |= (timelocks.srcCancellation & 0xFFFFFFFFn) << 64n;
  encoded |= (timelocks.srcPublicCancellation & 0xFFFFFFFFn) << 96n;
  encoded |= (timelocks.dstWithdrawal & 0xFFFFFFFFn) << 128n;
  encoded |= (timelocks.dstPublicWithdrawal & 0xFFFFFFFFn) << 160n;
  encoded |= (timelocks.dstCancellation & 0xFFFFFFFFn) << 192n;
  return encoded;
}

export async function approveToken(
  tokenContract: Contract,
  spender: string,
  amount: bigint
): Promise<void> {
  const currentAllowance = await tokenContract.allowance(
    await tokenContract.runner?.getAddress(),
    spender
  );
  
  if (currentAllowance < amount) {
    const approveTx = await tokenContract.approve(spender, amount);
    await approveTx.wait();
  }
}

export async function deploySrcEscrow(
  resolverContract: Contract,
  immutables: EVMImmutables,
  order: Order,
  signature: { r: string, vs: string },
  amount: bigint,
  partialAmount: bigint,
  safetyDeposit: bigint
): Promise<string> {
  const tx = await resolverContract.deploySrcCompactPartial(
    immutables,
    order,
    signature.r,
    signature.vs,
    amount,
    partialAmount,
    { value: safetyDeposit, gasLimit: 5000000 }
  );
  
  const receipt = await tx.wait();
  
  // Extract escrow address from events
  // This is simplified - in practice you'd parse the events
  return receipt.contractAddress || resolverContract.target;
}

export async function withdrawFromEscrow(
  escrowContract: Contract,
  secret: string,
  immutables: EVMImmutables
): Promise<void> {
  const tx = await escrowContract.withdrawWithSecret(secret, immutables, {
    gasLimit: 1000000
  });
  
  await tx.wait();
}

export function createTestOrder(
  maker: string,
  makerAsset: string,
  takerAsset: string,
  makingAmount: string,
  takingAmount: string,
  srcChainId: number,
  dstChainId: number,
  nonce: bigint = 0n
): Order {
  const now = Math.floor(Date.now() / 1000);
  
  return {
    salt: 12345n,
    maker,
    receiver: "0x0000000000000000000000000000000000000000",
    makerAsset,
    takerAsset,
    makingAmount: BigInt(makingAmount),
    takingAmount: BigInt(takingAmount),
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

export function createTestImmutables(
  orderHash: string,
  hashlock: string,
  maker: string,
  taker: string,
  token: string,
  amount: string,
  safetyDeposit: string,
  timelocks: bigint
): EVMImmutables {
  return {
    orderHash,
    hashlock,
    maker: BigInt(maker),
    taker: BigInt(taker || "0"),
    token: BigInt(token),
    amount: BigInt(amount),
    safetyDeposit: BigInt(safetyDeposit),
    timelocks,
  };
}

export async function getContractBalance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  accountAddress: string
): Promise<bigint> {
  const contract = new Contract(tokenAddress, ERC20_ABI, provider);
  return await contract.balanceOf(accountAddress);
}

export async function waitForConfirmations(
  provider: JsonRpcProvider,
  txHash: string,
  confirmations: number = 1
): Promise<any> {
  const receipt = await provider.waitForTransaction(txHash, confirmations);
  return receipt;
}

export function logEvmTransaction(
  chainName: string,
  action: string,
  txHash: string,
  chainId: number
): void {
  const explorerUrls: Record<number, string> = {
    84532: "https://sepolia.basescan.org/tx/",
    421614: "https://sepolia.arbiscan.io/tx/",
    11155111: "https://sepolia.etherscan.io/tx/",
  };
  
  const explorerUrl = explorerUrls[chainId];
  console.log(`[${chainName}] ${action}`);
  console.log(`  Transaction: ${txHash}`);
  if (explorerUrl) {
    console.log(`  Explorer: ${explorerUrl}${txHash}`);
  }
}