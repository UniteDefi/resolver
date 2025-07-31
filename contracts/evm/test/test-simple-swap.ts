import { ethers, Contract, Wallet, formatUnits, parseUnits, solidityPackedKeccak256 } from "ethers";
import * as dotenv from "dotenv";
import deployments from "../deployments.json";

dotenv.config();

const SIMPLE_RESOLVER_ABI = [
  "function deploySrc(tuple(address owner, address feeRecipient, address token, uint256 amount, uint256 timelocks, bytes32 hashlock) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order, bytes signature, uint256 amount) external payable",
  "function deployDst(tuple(address owner, address feeRecipient, address token, uint256 amount, uint256 timelocks, bytes32 hashlock) immutables, uint256 srcCancellationTimestamp) external payable"
];

const LIMIT_ORDER_PROTOCOL_ABI = [
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order) external pure returns (bytes32)",
  "function domainSeparator() external view returns (bytes32)",
  "function nonces(address) external view returns (uint256)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

async function main() {
  console.log("\\n🚀 Testing Simple Cross-Chain Swap");
  console.log("=====================================\\n");
  
  // Setup
  const baseProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  const arbProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  
  const user = new Wallet(process.env.TEST_USER_PRIVATE_KEY!, baseProvider);
  console.log("User address:", user.address);
  
  // Get contract addresses
  const baseConfig = (deployments.evm as any).base_sepolia;
  const arbConfig = (deployments.evm as any).arb_sepolia;
  
  // Contracts
  const srcToken = new Contract(baseConfig.MockUSDT, ERC20_ABI, user);
  const limitOrderProtocol = new Contract(baseConfig.LimitOrderProtocol, LIMIT_ORDER_PROTOCOL_ABI, user);
  const srcResolver = new Contract(baseConfig.SimpleResolver, SIMPLE_RESOLVER_ABI, user);
  
  // Create order
  const swapAmount = parseUnits("1", 6); // 1 USDT
  const currentNonce = await limitOrderProtocol.nonces(user.address);
  
  const order = {
    salt: BigInt(Math.floor(Math.random() * 1000000)),
    maker: user.address,
    receiver: ethers.ZeroAddress,
    makerAsset: baseConfig.MockUSDT,
    takerAsset: arbConfig.MockDAI,
    makingAmount: swapAmount,
    takingAmount: parseUnits("0.99", 18), // 0.99 DAI
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour
    nonce: currentNonce,
    srcChainId: BigInt(84532),
    dstChainId: BigInt(421614),
  };
  
  console.log("Order created:", await limitOrderProtocol.hashOrder(order));
  
  // Approve tokens
  console.log("\\nApproving tokens...");
  const approveTx = await srcToken.approve(baseConfig.LimitOrderProtocol, swapAmount);
  await approveTx.wait();
  console.log("✅ Approved");
  
  // Sign order
  const domain = {
    name: "LimitOrderProtocol",
    version: "1",
    chainId: 84532,
    verifyingContract: baseConfig.LimitOrderProtocol
  };
  
  const types = {
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
      { name: "dstChainId", type: "uint256" }
    ]
  };
  
  const signature = await user.signTypedData(domain, types, order);
  console.log("✅ Order signed");
  
  // Create immutables
  const secret = ethers.randomBytes(32);
  const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
  
  const immutables = {
    owner: user.address,
    feeRecipient: user.address,
    token: baseConfig.MockUSDT,
    amount: swapAmount,
    timelocks: encodeTimelocks({
      srcWithdrawal: 300n,
      srcPublicWithdrawal: 600n,
      srcCancellation: 900n,
      srcPublicCancellation: 1200n,
      dstWithdrawal: 300n,
      dstPublicWithdrawal: 600n,
      dstCancellation: 900n,
      dstPublicCancellation: 1200n
    }),
    hashlock: hashlock
  };
  
  // Deploy source escrow
  console.log("\\nDeploying source escrow...");
  const deployTx = await srcResolver.deploySrc(
    immutables,
    order,
    signature,
    swapAmount,
    { value: parseUnits("0.001", 18) }
  );
  await deployTx.wait();
  console.log("✅ Source escrow deployed!");
  
  console.log("\\n🎉 Test completed successfully!");
}

function encodeTimelocks(timelocks: Record<string, bigint>): bigint {
  let encoded = 0n;
  encoded |= timelocks.srcWithdrawal;
  encoded |= timelocks.srcPublicWithdrawal << 24n;
  encoded |= timelocks.srcCancellation << 48n;
  encoded |= timelocks.srcPublicCancellation << 72n;
  encoded |= timelocks.dstWithdrawal << 96n;
  encoded |= timelocks.dstPublicWithdrawal << 120n;
  encoded |= timelocks.dstCancellation << 144n;
  encoded |= timelocks.dstPublicCancellation << 168n;
  return encoded;
}

main().catch(console.error);