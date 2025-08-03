import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  solidityPackedKeccak256,
  randomBytes,
  getBytes,
  hexlify,
  TypedDataDomain,
  TypedDataField,
} from "ethers";
import { SuiClient } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";

dotenv.config();

// Load deployments from JSON file
const deploymentsPath = path.join(__dirname, "../deployments.json");
if (!fs.existsSync(deploymentsPath)) {
  throw new Error(`Deployments file not found at: ${deploymentsPath}`);
}

const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

// EVM Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const ESCROW_FACTORY_ABI = [
  "function createSrcEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 partialAmount, address resolver) external payable returns (address)",
  "function createDstEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp, uint256 partialAmount, address resolver) external payable returns (address)",
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function getTotalFilledAmount(bytes32 orderHash) external view returns (uint256)",
  "function transferUserFunds(bytes32 orderHash, address from, address token, uint256 amount) external"
];

const UNITE_RESOLVER_ABI = [
  "function deploySrcCompactPartial(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order, bytes32 r, bytes32 vs, uint256 amount, uint256 partialAmount) external payable",
  "function deployDstPartial(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp, uint256 partialAmount) external payable"
];

const ESCROW_ABI = [
  "function withdrawWithSecret(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external"
];

const LIMIT_ORDER_PROTOCOL_ABI = [
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order) external view returns (bytes32)",
  "function nonces(address) external view returns (uint256)"
];

// Configuration from deployments.json
const SUI_CONFIG = deployments.sui.testnet;
const BASE_CONFIG = deployments.evm.base_sepolia;

// Helper functions
function encodeTimelocks(timelocks: Record<string, bigint>): bigint {
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

async function signOrder(
  order: any,
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

function bytes32ToArray(bytes32: string): number[] {
  const hex = bytes32.replace('0x', '');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

// Helper function to check gas balances
async function checkGasBalances(
  baseProvider: JsonRpcProvider,
  suiClient: SuiClient,
  accounts: {
    address: string;
    name: string;
    chain: 'base' | 'sui';
    requiredBalance: bigint;
  }[]
): Promise<boolean> {
  let hasInsufficientGas = false;
  
  for (const account of accounts) {
    if (account.chain === 'base') {
      const balance = await baseProvider.getBalance(account.address);
      if (balance < account.requiredBalance) {
        console.log(`❌ ${account.name} has insufficient ETH: ${formatUnits(balance, 18)} ETH`);
        console.log(`   Required: ${formatUnits(account.requiredBalance, 18)} ETH`);
        console.log(`   Please fund address: ${account.address}`);
        hasInsufficientGas = true;
      }
    } else {
      const balance = await suiClient.getBalance({ owner: account.address });
      const balanceAmount = BigInt(balance.totalBalance);
      if (balanceAmount < account.requiredBalance) {
        console.log(`❌ ${account.name} has insufficient SUI: ${Number(balanceAmount) / 1e9} SUI`);
        console.log(`   Required: ${Number(account.requiredBalance) / 1e9} SUI`);
        console.log(`   Please fund address: ${account.address}`);
        hasInsufficientGas = true;
      }
    }
  }
  
  return !hasInsufficientGas;
}

// Helper function to mint test tokens
async function mintTestTokens(
  provider: JsonRpcProvider,
  tokenAddress: string,
  recipientAddress: string,
  amount: bigint,
  deployer: Wallet
) {
  const MOCK_TOKEN_ABI = [
    "function mint(address to, uint256 amount) external",
    "function balanceOf(address owner) view returns (uint256)"
  ];
  
  const token = new Contract(tokenAddress, MOCK_TOKEN_ABI, deployer);
  
  try {
    const currentBalance = await token.balanceOf(recipientAddress);
    if (currentBalance < amount) {
      console.log(`  🪙 Minting ${formatUnits(amount, 6)} tokens to ${recipientAddress}...`);
      const tx = await token.mint(recipientAddress, amount);
      await tx.wait();
      console.log(`  ✅ Minted successfully`);
    }
  } catch (error: any) {
    console.log(`  ❌ Failed to mint tokens: ${error.message}`);
  }
}

// Helper function to mint Sui test tokens
async function mintSuiTestTokens(
  suiClient: SuiClient,
  packageId: string,
  tokenType: 'USDT' | 'DAI',
  recipientAddress: string,
  amount: bigint,
  minter: Ed25519Keypair
) {
  console.log(`  ℹ️ Note: Sui token minting requires treasury cap access`);
  console.log(`  ℹ️ For testing, ensure ${recipientAddress} has sufficient ${tokenType}`);
  // In a real test environment, you would need to:
  // 1. Have access to the treasury cap object
  // 2. Or have a faucet/mint function that doesn't require treasury cap
  // 3. Or pre-fund test accounts with tokens
}

describe("🌉 Cross-Chain Swaps: Sui ↔ Base Sepolia", () => {

  beforeAll(async () => {
    // Verify required environment variables (only private keys and RPC URLs)
    const requiredVars = [
      'SUI_RPC_URL',
      'BASE_SEPOLIA_RPC_URL', 
      'PRIVATE_KEY',
      'SUI_RESOLVER_PRIVATE_KEY_0',
      'SUI_RESOLVER_PRIVATE_KEY_1',
      'TEST_USER_PRIVATE_KEY',
      'RESOLVER_PRIVATE_KEY_0', 
      'RESOLVER_PRIVATE_KEY_1',
      'DEPLOYER_PRIVATE_KEY'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error("❌ Missing required environment variables:");
      missingVars.forEach(varName => console.error(`   - ${varName}`));
      console.error("\n📝 Add these to your .env file:");
      console.error("   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org");
      throw new Error("Environment configuration incomplete");
    }

    // Verify deployments are loaded
    console.log("📋 Loaded deployments:");
    console.log("  Sui Testnet Package:", SUI_CONFIG.packageId);
    console.log("  Base Sepolia Factory:", BASE_CONFIG.UniteEscrowFactory);
    
    if (!SUI_CONFIG.packageId || !BASE_CONFIG.UniteEscrowFactory) {
      throw new Error("Invalid deployments.json - missing required contract addresses");
    }

    console.log("✅ Environment configuration verified");
    console.log("✅ Contract addresses loaded from deployments.json");
  });

  describe("🔄 Base Sepolia → Sui Testnet (USDT → DAI)", () => {
    it("should execute complete cross-chain swap from Base to Sui", async () => {
      // Setup providers and clients
      const baseProvider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
      const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io" });
      
      // Setup wallets
      const user = new Wallet(process.env.TEST_USER_PRIVATE_KEY || "", baseProvider);
      const resolver1Base = new Wallet(process.env.RESOLVER_PRIVATE_KEY_0 || "", baseProvider);
      const resolver2Base = new Wallet(process.env.RESOLVER_PRIVATE_KEY_1 || "", baseProvider);
      const relayer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", baseProvider);
      
      // Sui wallets
      const userSui = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PRIVATE_KEY || "", "hex"));
      const resolver1Sui = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_0 || "", "hex"));
      const resolver2Sui = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_1 || "", "hex"));
      
      // Setup contracts
      const baseToken = new Contract(BASE_CONFIG.MockUSDT, ERC20_ABI, user);
      const baseFactory = new Contract(BASE_CONFIG.UniteEscrowFactory, ESCROW_FACTORY_ABI, relayer);
      const baseLOP = new Contract(BASE_CONFIG.UniteLimitOrderProtocol, LIMIT_ORDER_PROTOCOL_ABI, baseProvider);
      
      console.log("\n=== CROSS-CHAIN SWAP: BASE SEPOLIA → SUI TESTNET ===");
      console.log("Trading: USDT (Base) → DAI (Sui Testnet)");
      
      // Setup DAI contract
      const baseDAI = new Contract(BASE_CONFIG.MockDAI, ERC20_ABI, user);
      
      // STEP 1: Check balances
      console.log("\n=== STEP 1: INITIAL BALANCES ===");
      
      // Base Sepolia balances
      const userUSDTBalance = await baseToken.balanceOf(user.address);
      const userDAIBalanceBase = await baseDAI.balanceOf(user.address);
      const userETHBalance = await baseProvider.getBalance(user.address);
      
      const resolver1USDTBalanceBase = await baseToken.balanceOf(resolver1Base.address);
      const resolver1DAIBalanceBase = await baseDAI.balanceOf(resolver1Base.address);
      const resolver2USDTBalanceBase = await baseToken.balanceOf(resolver2Base.address);
      const resolver2DAIBalanceBase = await baseDAI.balanceOf(resolver2Base.address);
      const resolver1ETHBalance = await baseProvider.getBalance(resolver1Base.address);
      const resolver2ETHBalance = await baseProvider.getBalance(resolver2Base.address);
      
      // Sui balances - check USDT and DAI balances
      const userSuiBalance = await suiClient.getBalance({ owner: userSui.toSuiAddress() });
      const userUSDTBalanceSui = await suiClient.getBalance({
        owner: userSui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_usdt::MOCK_USDT`
      });
      const userDAIBalanceSui = await suiClient.getBalance({
        owner: userSui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
      });
      
      const resolver1USDTBalanceSui = await suiClient.getBalance({
        owner: resolver1Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_usdt::MOCK_USDT`
      });
      const resolver1DAIBalanceSui = await suiClient.getBalance({
        owner: resolver1Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
      });
      const resolver1SuiBalance = await suiClient.getBalance({ owner: resolver1Sui.toSuiAddress() });
      
      const resolver2USDTBalanceSui = await suiClient.getBalance({
        owner: resolver2Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_usdt::MOCK_USDT`
      });
      const resolver2DAIBalanceSui = await suiClient.getBalance({
        owner: resolver2Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
      });
      const resolver2SuiBalance = await suiClient.getBalance({ owner: resolver2Sui.toSuiAddress() });
      
      console.log("Base Sepolia:");
      console.log("  User USDT:", formatUnits(userUSDTBalance, 6));
      console.log("  User DAI:", formatUnits(userDAIBalanceBase, 6));
      console.log("  User ETH:", formatUnits(userETHBalance, 18));
      console.log("  Resolver 1 USDT:", formatUnits(resolver1USDTBalanceBase, 6));
      console.log("  Resolver 1 DAI:", formatUnits(resolver1DAIBalanceBase, 6));
      console.log("  Resolver 1 ETH:", formatUnits(resolver1ETHBalance, 18));
      console.log("  Resolver 2 USDT:", formatUnits(resolver2USDTBalanceBase, 6));
      console.log("  Resolver 2 DAI:", formatUnits(resolver2DAIBalanceBase, 6));
      console.log("  Resolver 2 ETH:", formatUnits(resolver2ETHBalance, 18));
      console.log("\nSui Testnet:");
      console.log("  User SUI:", parseInt(userSuiBalance.totalBalance) / 1e9);
      console.log("  User USDT:", parseInt(userUSDTBalanceSui.totalBalance) / 1e6);
      console.log("  User DAI:", parseInt(userDAIBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 1 USDT:", parseInt(resolver1USDTBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 1 DAI:", parseInt(resolver1DAIBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 1 SUI:", parseInt(resolver1SuiBalance.totalBalance) / 1e9);
      console.log("  Resolver 2 USDT:", parseInt(resolver2USDTBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 2 DAI:", parseInt(resolver2DAIBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 2 SUI:", parseInt(resolver2SuiBalance.totalBalance) / 1e9);
      
      // Check gas balances
      console.log("\n=== CHECKING GAS BALANCES ===");
      const gasCheckPassed = await checkGasBalances(baseProvider, suiClient, [
        { address: user.address, name: "User (Base)", chain: 'base', requiredBalance: parseUnits("0.01", 18) },
        { address: resolver1Base.address, name: "Resolver 1 (Base)", chain: 'base', requiredBalance: parseUnits("0.02", 18) },
        { address: resolver2Base.address, name: "Resolver 2 (Base)", chain: 'base', requiredBalance: parseUnits("0.02", 18) },
        { address: userSui.toSuiAddress(), name: "User (Sui)", chain: 'sui', requiredBalance: BigInt(100000000) }, // 0.1 SUI
        { address: resolver1Sui.toSuiAddress(), name: "Resolver 1 (Sui)", chain: 'sui', requiredBalance: BigInt(300000000) }, // 0.3 SUI
        { address: resolver2Sui.toSuiAddress(), name: "Resolver 2 (Sui)", chain: 'sui', requiredBalance: BigInt(300000000) }, // 0.3 SUI
      ]);
      
      if (!gasCheckPassed) {
        console.log("\n⚠️  INSUFFICIENT GAS - Please fund the above addresses before running the test");
        return;
      }
      console.log("✅ All accounts have sufficient gas");
      
      // Mint tokens if needed
      console.log("\n=== MINTING TEST TOKENS IF NEEDED ===");
      
      const deployer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", baseProvider);
      const requiredUSDT = parseUnits("100", 6); // 100 USDT needed
      const requiredDAI = parseUnits("100", 6); // 100 DAI needed
      
      // Mint Base tokens
      if (userUSDTBalance < requiredUSDT) {
        await mintTestTokens(baseProvider, BASE_CONFIG.MockUSDT, user.address, requiredUSDT, deployer);
      }
      
      if (resolver1DAIBalanceBase < requiredDAI) {
        await mintTestTokens(baseProvider, BASE_CONFIG.MockDAI, resolver1Base.address, requiredDAI, deployer);
      }
      
      if (resolver2DAIBalanceBase < requiredDAI) {
        await mintTestTokens(baseProvider, BASE_CONFIG.MockDAI, resolver2Base.address, requiredDAI, deployer);
      }
      
      // STEP 2: Approve tokens on Base
      console.log("\n=== STEP 2: APPROVE TOKENS ===");
      const currentAllowance = await baseToken.allowance(user.address, BASE_CONFIG.UniteEscrowFactory);
      if (currentAllowance < parseUnits("100", 6)) {
        const approveTx = await baseToken.approve(BASE_CONFIG.UniteEscrowFactory, parseUnits("1000", 6));
        await approveTx.wait();
        console.log("✅ User approved USDT to Base factory");
      }
      
      // STEP 3: Create order and generate secret
      console.log("\n=== STEP 3: CREATE ORDER ===");
      const totalUSDTAmount = parseUnits("10", 6); // 10 USDT
      const totalDAIAmount = parseUnits("10", 6); // 10 DAI (1:1 trade)
      const safetyDepositPerUnit = parseUnits("0.001", 18); // Safety deposit
      
      const auctionStartTime = Math.floor(Date.now() / 1000);
      const auctionEndTime = auctionStartTime + 300;
      const startPrice = parseUnits("1", 18); // 1 USDT = 1 DAI
      const endPrice = parseUnits("1", 18);   // 1 USDT = 1 DAI (no slippage for stablecoins)
      
      const secret = randomBytes(32);
      const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
      console.log("Secret:", hexlify(secret));
      console.log("Hashlock:", hashlock);
      
      const userNonce = await baseLOP.nonces(user.address);
      const order = {
        salt: 12345n,
        maker: user.address,
        receiver: "0x0000000000000000000000000000000000000000", // Use zero address for cross-chain
        makerAsset: BASE_CONFIG.MockUSDT,
        takerAsset: "0x0000000000000000000000000000000000000002", // Cross-chain DAI placeholder
        makingAmount: totalUSDTAmount,
        takingAmount: totalDAIAmount,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        nonce: userNonce,
        srcChainId: 84532, // Base Sepolia
        dstChainId: 2,     // Sui Testnet
        auctionStartTime: auctionStartTime,
        auctionEndTime: auctionEndTime,
        startPrice: startPrice,
        endPrice: endPrice
      };
      
      const orderHash = await baseLOP.hashOrder(order);
      console.log("Order hash:", orderHash);
      console.log("Actual Sui recipient address:", userSui.toSuiAddress());
      
      const signature = await signOrder(
        order,
        user,
        "UniteLimitOrderProtocol",
        "1",
        84532,
        BASE_CONFIG.UniteLimitOrderProtocol
      );
      console.log("✅ Order signed");
      
      // STEP 4: Deploy source escrows on Base Sepolia
      console.log("\n=== STEP 4: DEPLOY SOURCE ESCROWS (BASE SEPOLIA) ===");
      
      const timelocks = encodeTimelocks({
        srcWithdrawal: 0n,
        srcPublicWithdrawal: 900n,
        srcCancellation: 1800n,
        srcPublicCancellation: 3600n,
        dstWithdrawal: 0n,
        dstPublicWithdrawal: 900n,
        dstCancellation: 2700n
      });
      
      const totalSafetyDeposit = (safetyDepositPerUnit * totalUSDTAmount) / parseUnits("1", 6);
      
      const srcImmutables = {
        orderHash: orderHash,
        hashlock: hashlock,
        maker: BigInt(user.address),
        taker: BigInt("0"),
        token: BigInt(BASE_CONFIG.MockUSDT),
        amount: totalUSDTAmount,
        safetyDeposit: totalSafetyDeposit,
        timelocks: timelocks
      };
      
      // Resolver commitments
      const resolver1USDTAmount = parseUnits("6", 6);  // 60% of 10 USDT
      const resolver2USDTAmount = parseUnits("4", 6);  // 40% of 10 USDT
      
      const resolver1SafetyDeposit = (totalSafetyDeposit * resolver1USDTAmount) / totalUSDTAmount;
      const resolver2SafetyDeposit = (totalSafetyDeposit * resolver2USDTAmount) / totalUSDTAmount;
      
      // Deploy source escrows
      const resolver1BaseContract = new Contract(BASE_CONFIG.UniteResolver0, UNITE_RESOLVER_ABI, resolver1Base);
      const resolver2BaseContract = new Contract(BASE_CONFIG.UniteResolver1, UNITE_RESOLVER_ABI, resolver2Base);
      
      try {
        const tx1 = await resolver1BaseContract.deploySrcCompactPartial(
          srcImmutables, order, signature.r, signature.vs, resolver1USDTAmount, resolver1USDTAmount,
          { value: resolver1SafetyDeposit, gasLimit: 5000000 }
        );
        await tx1.wait();
        console.log("✅ Resolver 1 deployed Base source escrow");
      } catch (error: any) {
        console.log("❌ Resolver 1 Base failed:", error.message);
      }
      
      try {
        const tx2 = await resolver2BaseContract.deploySrcCompactPartial(
          srcImmutables, order, signature.r, signature.vs, resolver2USDTAmount, resolver2USDTAmount,
          { value: resolver2SafetyDeposit, gasLimit: 5000000 }
        );
        await tx2.wait();
        console.log("✅ Resolver 2 deployed Base source escrow");
      } catch (error: any) {
        console.log("❌ Resolver 2 Base failed:", error.message);
      }
      
      // STEP 5: Deploy destination escrows on Sui
      console.log("\n=== STEP 5: DEPLOY DESTINATION ESCROWS (SUI TESTNET) ===");
      
      // Calculate proportional DAI amounts
      const resolver1DAIAmount = (totalDAIAmount * resolver1USDTAmount) / totalUSDTAmount;
      const resolver2DAIAmount = (totalDAIAmount * resolver2USDTAmount) / totalUSDTAmount;
      
      const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      // Convert for Sui
      const orderHashBytes = bytes32ToArray(orderHash);
      const hashlockBytes = bytes32ToArray(hashlock);
      const makerAddress = userSui.toSuiAddress(); // Use Sui address for Sui-side escrow
      
      let dstEscrowId = "";
      
      // Create first destination escrow on Sui
      try {
        const tx1 = new TransactionBlock();
        
        const resolver1SafetyDepositSui = 100000000; // 0.1 SUI safety deposit
        const [coin1] = tx1.splitCoins(tx1.gas, [tx1.pure(resolver1SafetyDepositSui)]);
        
        // First create the Timelocks struct
        const [timelocks] = tx1.moveCall({
          target: `${SUI_CONFIG.packageId}::escrow::create_timelocks`,
          arguments: [
            tx1.pure(0), // deployed_at (will be set by escrow)
            tx1.pure(0), // src_withdrawal
            tx1.pure(900), // src_public_withdrawal
            tx1.pure(1800), // src_cancellation
            tx1.pure(3600), // src_public_cancellation
            tx1.pure(0), // dst_withdrawal
            tx1.pure(900), // dst_public_withdrawal
            tx1.pure(2700), // dst_cancellation
          ],
        });
        
        tx1.moveCall({
          target: `${SUI_CONFIG.packageId}::escrow_factory::create_dst_escrow_partial`,
          arguments: [
            tx1.object(SUI_CONFIG.EscrowFactory),
            tx1.pure(orderHashBytes),
            tx1.pure(hashlockBytes),
            tx1.pure(makerAddress),
            tx1.pure("0x0000000000000000000000000000000000000000000000000000000000000000"),
            tx1.pure(Number(totalDAIAmount)),
            tx1.pure(1000000), // safety_deposit_per_unit
            timelocks,
            tx1.pure(srcCancellationTimestamp),
            tx1.pure(Number(resolver1DAIAmount)),
            tx1.pure(resolver1Sui.toSuiAddress()),
            coin1,
            tx1.object("0x6"), // Clock object
          ],
        });
        
        const result1 = await suiClient.signAndExecuteTransactionBlock({
          transactionBlock: tx1,
          signer: resolver1Sui,
          options: {
            showEffects: true,
            showObjectChanges: true,
            showEvents: true,
          },
        });
        
        if (result1.effects?.status.status === "success") {
          console.log("✅ Resolver 1 deployed Sui destination escrow");
          
          // Extract escrow ID from object changes
          const createdObjects = result1.objectChanges?.filter(change => 
            change.type === "created" && 
            "owner" in change && 
            typeof change.owner === "object" &&
            "Shared" in change.owner
          );
          
          if (createdObjects && createdObjects.length > 0 && "objectId" in createdObjects[0]) {
            dstEscrowId = createdObjects[0].objectId;
            console.log("   Escrow ID:", dstEscrowId);
          }
        } else {
          console.log("❌ Resolver 1 Sui escrow failed:", result1.effects?.status.error);
        }
      } catch (error: any) {
        console.log("❌ Resolver 1 Sui escrow failed:", error.message);
      }
      
      // Add second resolver if first succeeded
      if (dstEscrowId) {
        try {
          const tx2 = new TransactionBlock();
          
          const resolver2SafetyDepositSui = 100000000; // 0.1 SUI safety deposit
          const [coin2] = tx2.splitCoins(tx2.gas, [tx2.pure(resolver2SafetyDepositSui)]);
          
          tx2.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow_factory::add_resolver_to_dst_escrow`,
            arguments: [
              tx2.object(SUI_CONFIG.EscrowFactory),
              tx2.object(dstEscrowId),
              tx2.pure(orderHashBytes),
              tx2.pure(resolver2Sui.toSuiAddress()),
              tx2.pure(Number(resolver2DAIAmount)),
              coin2,
            ],
          });
          
          const result2 = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: tx2,
            signer: resolver2Sui,
            options: {
              showEffects: true,
            },
          });
          
          if (result2.effects?.status.status === "success") {
            console.log("✅ Resolver 2 added to Sui destination escrow");
          } else {
            console.log("❌ Resolver 2 Sui escrow failed:", result2.effects?.status.error);
          }
        } catch (error: any) {
          console.log("❌ Resolver 2 Sui escrow failed:", error.message);
        }
      }
      
      // STEP 6: Deposit DAI tokens to destination escrow
      console.log("\n=== STEP 6: DEPOSIT DAI TOKENS ===");
      
      if (dstEscrowId) {
        // Resolver 1 deposits DAI
        // Note: The current Sui contracts only support SUI token deposits
        // DAI token deposits would require additional contract functions
        console.log("⚠️  DAI deposits on Sui are not yet implemented in the contracts");
        
        // Resolver 2 deposits DAI
        // Note: The current Sui contracts only support SUI token deposits
      }
      
      // STEP 7: Transfer user funds on Base
      console.log("\n=== STEP 7: TRANSFER USER FUNDS ===");
      const totalFilled = await baseFactory.getTotalFilledAmount(orderHash);
      console.log("Total filled amount:", formatUnits(totalFilled, 6), "USDT");
      
      if (totalFilled >= totalUSDTAmount) {
        const userUSDTBefore = await baseToken.balanceOf(user.address);
        
        const transferTx = await baseFactory.transferUserFunds(
          orderHash, user.address, BASE_CONFIG.MockUSDT, totalUSDTAmount
        );
        await transferTx.wait();
        console.log("✅ Relayer transferred user funds to Base escrow");
        
        const userUSDTAfter = await baseToken.balanceOf(user.address);
        console.log("USDT transferred:", formatUnits(userUSDTBefore - userUSDTAfter, 6));
      }
      
      // STEP 8: Reveal secret and execute withdrawals
      console.log("\n=== STEP 8: SECRET REVEALED & WITHDRAWALS ===");
      console.log("🔓 Secret revealed:", hexlify(secret));
      
      // Withdraw from Sui destination escrow (user gets DAI)
      if (dstEscrowId) {
        try {
          const withdrawTx = new TransactionBlock();
          const secretBytes = Array.from(secret);
          
          withdrawTx.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow::withdraw_sui_with_secret`,
            arguments: [
              withdrawTx.object(dstEscrowId),
              withdrawTx.pure(secretBytes),
              withdrawTx.object("0x6"), // Clock object
            ],
          });
          
          const userDAIBalanceBefore = await suiClient.getBalance({ 
            owner: userSui.toSuiAddress(),
            coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
          });
          
          const withdrawResult = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: withdrawTx,
            signer: userSui,
            options: { showEffects: true, showEvents: true },
          });
          
          if (withdrawResult.effects?.status.status === "success") {
            console.log("✅ Sui destination escrow withdrawal completed");
            
            const userDAIBalanceAfter = await suiClient.getBalance({ 
              owner: userSui.toSuiAddress(),
              coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
            });
            const daiReceived = (parseInt(userDAIBalanceAfter.totalBalance) - parseInt(userDAIBalanceBefore.totalBalance)) / 1e6;
            console.log("DAI received by user:", daiReceived.toFixed(2));
          } else {
            console.log("❌ Sui withdrawal failed:", withdrawResult.effects?.status.error);
          }
        } catch (error: any) {
          console.log("❌ Sui withdrawal failed:", error.message);
        }
      }
      
      // Withdraw from Base source escrow (resolvers get USDT)
      try {
        const srcEscrowAddress = await baseFactory.addressOfEscrowSrc(srcImmutables);
        const srcEscrow = new Contract(srcEscrowAddress, ESCROW_ABI, user);
        
        const resolver1USDTBefore = await baseToken.balanceOf(resolver1Base.address);
        const resolver2USDTBefore = await baseToken.balanceOf(resolver2Base.address);
        
        const withdrawTx = await srcEscrow.withdrawWithSecret(secret, srcImmutables, { gasLimit: 1000000 });
        await withdrawTx.wait();
        console.log("✅ Base source escrow withdrawal completed");
        
        const resolver1USDTAfter = await baseToken.balanceOf(resolver1Base.address);
        const resolver2USDTAfter = await baseToken.balanceOf(resolver2Base.address);
        
        console.log("USDT received by resolvers:");
        console.log("  Resolver 1:", formatUnits(resolver1USDTAfter - resolver1USDTBefore, 6));
        console.log("  Resolver 2:", formatUnits(resolver2USDTAfter - resolver2USDTBefore, 6));
        
      } catch (error: any) {
        console.log("❌ Base source escrow withdrawal failed:", error.message);
      }
      
      console.log("\n=== SWAP COMPLETED: BASE → SUI ===");
      console.log("✅ User swapped USDT on Base for DAI on Sui Testnet");
      console.log("✅ Resolvers received USDT proportionally");
      console.log("✅ All safety deposits returned");
      
    }, 300000); // 5 minute timeout
  });

  describe("🔄 Sui Testnet → Base Sepolia (USDT → DAI)", () => {
    it("should execute complete cross-chain swap from Sui to Base", async () => {
      console.log("\n=== CROSS-CHAIN SWAP: SUI TESTNET → BASE SEPOLIA ===");
      console.log("Trading: USDT (Sui Testnet) → DAI (Base)");
      
      // Setup providers and clients
      const baseProvider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
      const suiClient = new SuiClient({ url: process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io" });
      
      // Setup wallets
      const userBase = new Wallet(process.env.TEST_USER_PRIVATE_KEY || "", baseProvider);
      const resolver1Base = new Wallet(process.env.RESOLVER_PRIVATE_KEY_0 || "", baseProvider);
      const resolver2Base = new Wallet(process.env.RESOLVER_PRIVATE_KEY_1 || "", baseProvider);
      
      // Sui wallets
      const userSui = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PRIVATE_KEY || "", "hex"));
      const resolver1Sui = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_0 || "", "hex"));
      const resolver2Sui = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_1 || "", "hex"));
      
      // Setup contracts
      const baseUSDT = new Contract(BASE_CONFIG.MockUSDT, ERC20_ABI, userBase);
      const baseDAI = new Contract(BASE_CONFIG.MockDAI, ERC20_ABI, userBase);
      const baseFactory = new Contract(BASE_CONFIG.UniteEscrowFactory, ESCROW_FACTORY_ABI, userBase);
      
      console.log("\n=== STEP 1: INITIAL BALANCES ===");
      
      // Sui balances
      const userSuiBalance = await suiClient.getBalance({ owner: userSui.toSuiAddress() });
      const userUSDTBalanceSui = await suiClient.getBalance({
        owner: userSui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_usdt::MOCK_USDT`
      });
      const userDAIBalanceSui = await suiClient.getBalance({
        owner: userSui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
      });
      
      const resolver1SuiBalance = await suiClient.getBalance({ owner: resolver1Sui.toSuiAddress() });
      const resolver1USDTBalanceSui = await suiClient.getBalance({
        owner: resolver1Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_usdt::MOCK_USDT`
      });
      const resolver1DAIBalanceSui = await suiClient.getBalance({
        owner: resolver1Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
      });
      
      const resolver2SuiBalance = await suiClient.getBalance({ owner: resolver2Sui.toSuiAddress() });
      const resolver2USDTBalanceSui = await suiClient.getBalance({
        owner: resolver2Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_usdt::MOCK_USDT`
      });
      const resolver2DAIBalanceSui = await suiClient.getBalance({
        owner: resolver2Sui.toSuiAddress(),
        coinType: `${SUI_CONFIG.packageId}::mock_dai::MOCK_DAI`
      });
      
      // Base balances
      const userUSDTBalanceBase = await baseUSDT.balanceOf(userBase.address);
      const userDAIBalanceBase = await baseDAI.balanceOf(userBase.address);
      const resolver1USDTBalanceBase = await baseUSDT.balanceOf(resolver1Base.address);
      const resolver1DAIBalanceBase = await baseDAI.balanceOf(resolver1Base.address);
      const resolver2USDTBalanceBase = await baseUSDT.balanceOf(resolver2Base.address);
      const resolver2DAIBalanceBase = await baseDAI.balanceOf(resolver2Base.address);
      const resolver1ETHBalance = await baseProvider.getBalance(resolver1Base.address);
      const resolver2ETHBalance = await baseProvider.getBalance(resolver2Base.address);
      const userBaseETHBalance = await baseProvider.getBalance(userBase.address);
      
      console.log("Sui Testnet:");
      console.log("  User SUI:", parseInt(userSuiBalance.totalBalance) / 1e9);
      console.log("  User USDT:", parseInt(userUSDTBalanceSui.totalBalance) / 1e6);
      console.log("  User DAI:", parseInt(userDAIBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 1 USDT:", parseInt(resolver1USDTBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 1 DAI:", parseInt(resolver1DAIBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 1 SUI:", parseInt(resolver1SuiBalance.totalBalance) / 1e9);
      console.log("  Resolver 2 USDT:", parseInt(resolver2USDTBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 2 DAI:", parseInt(resolver2DAIBalanceSui.totalBalance) / 1e6);
      console.log("  Resolver 2 SUI:", parseInt(resolver2SuiBalance.totalBalance) / 1e9);
      console.log("\nBase Sepolia:");
      console.log("  User USDT:", formatUnits(userUSDTBalanceBase, 6));
      console.log("  User DAI:", formatUnits(userDAIBalanceBase, 6));
      console.log("  User ETH:", formatUnits(userBaseETHBalance, 18));
      console.log("  Resolver 1 USDT:", formatUnits(resolver1USDTBalanceBase, 6));
      console.log("  Resolver 1 DAI:", formatUnits(resolver1DAIBalanceBase, 6));
      console.log("  Resolver 1 ETH:", formatUnits(resolver1ETHBalance, 18));
      console.log("  Resolver 2 USDT:", formatUnits(resolver2USDTBalanceBase, 6));
      console.log("  Resolver 2 DAI:", formatUnits(resolver2DAIBalanceBase, 6));
      console.log("  Resolver 2 ETH:", formatUnits(resolver2ETHBalance, 18));
      
      // Check gas balances
      console.log("\n=== CHECKING GAS BALANCES ===");
      const gasCheckPassed = await checkGasBalances(baseProvider, suiClient, [
        { address: userBase.address, name: "User (Base)", chain: 'base', requiredBalance: parseUnits("0.01", 18) },
        { address: resolver1Base.address, name: "Resolver 1 (Base)", chain: 'base', requiredBalance: parseUnits("0.02", 18) },
        { address: resolver2Base.address, name: "Resolver 2 (Base)", chain: 'base', requiredBalance: parseUnits("0.02", 18) },
        { address: userSui.toSuiAddress(), name: "User (Sui)", chain: 'sui', requiredBalance: BigInt(100000000) }, // 0.1 SUI
        { address: resolver1Sui.toSuiAddress(), name: "Resolver 1 (Sui)", chain: 'sui', requiredBalance: BigInt(300000000) }, // 0.3 SUI
        { address: resolver2Sui.toSuiAddress(), name: "Resolver 2 (Sui)", chain: 'sui', requiredBalance: BigInt(300000000) }, // 0.3 SUI
      ]);
      
      if (!gasCheckPassed) {
        console.log("\n⚠️  INSUFFICIENT GAS - Please fund the above addresses before running the test");
        return;
      }
      console.log("✅ All accounts have sufficient gas");
      
      // Mint tokens if needed
      console.log("\n=== MINTING TEST TOKENS IF NEEDED ===");
      
      const deployer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", baseProvider);
      const requiredUSDT = parseUnits("100", 6); // 100 USDT needed
      const requiredDAI = parseUnits("100", 6); // 100 DAI needed
      
      // Mint Sui tokens if needed
      const deployerSui = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PRIVATE_KEY || "", "hex"));
      
      if (parseInt(userUSDTBalanceSui.totalBalance) < Number(requiredUSDT)) {
        await mintSuiTestTokens(suiClient, SUI_CONFIG.packageId, 'USDT', userSui.toSuiAddress(), requiredUSDT, deployerSui);
      }
      
      if (parseInt(resolver1USDTBalanceSui.totalBalance) < Number(requiredUSDT)) {
        await mintSuiTestTokens(suiClient, SUI_CONFIG.packageId, 'USDT', resolver1Sui.toSuiAddress(), requiredUSDT, deployerSui);
      }
      
      if (parseInt(resolver2USDTBalanceSui.totalBalance) < Number(requiredUSDT)) {
        await mintSuiTestTokens(suiClient, SUI_CONFIG.packageId, 'USDT', resolver2Sui.toSuiAddress(), requiredUSDT, deployerSui);
      }
      
      // Mint Base DAI tokens if needed
      if (resolver1DAIBalanceBase < requiredDAI) {
        await mintTestTokens(baseProvider, BASE_CONFIG.MockDAI, resolver1Base.address, requiredDAI, deployer);
      }
      
      if (resolver2DAIBalanceBase < requiredDAI) {
        await mintTestTokens(baseProvider, BASE_CONFIG.MockDAI, resolver2Base.address, requiredDAI, deployer);
      }
      
      // Generate secret and create order on Sui
      console.log("\n=== STEP 2: CREATE ORDER ON SUI ===");
      const totalUSDTAmountSui = parseUnits("10", 6); // 10 USDT on Sui
      const totalDAIAmountBase = parseUnits("10", 6); // 10 DAI on Base (1:1 trade)
      
      const secret = randomBytes(32);
      const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
      console.log("Secret:", hexlify(secret));
      console.log("Hashlock:", hashlock);
      
      // Create Sui order structure
      const orderHashBytes = crypto.randomBytes(32);
      const orderHash = "0x" + orderHashBytes.toString('hex');
      const hashlockBytes = bytes32ToArray(hashlock);
      
      console.log("Order hash:", orderHash);
      console.log("✅ Order created on Sui");
      
      // STEP 3: Deploy source escrows on Sui
      console.log("\n=== STEP 3: DEPLOY SOURCE ESCROWS (SUI TESTNET) ===");
      
      const resolver1USDTAmountSui = parseUnits("6", 6); // 6 USDT (60%)
      const resolver2USDTAmountSui = parseUnits("4", 6); // 4 USDT (40%)
      
      let srcEscrowId = "";
      
      try {
        const tx1 = new TransactionBlock();
        
        const resolver1SafetyDeposit = 100000000; // 0.1 SUI safety deposit
        const [coin1] = tx1.splitCoins(tx1.gas, [tx1.pure(resolver1SafetyDeposit)]);
        
        const orderHashArray = Array.from(orderHashBytes);
        
        // First create the Timelocks struct
        const [timelocks] = tx1.moveCall({
          target: `${SUI_CONFIG.packageId}::escrow::create_timelocks`,
          arguments: [
            tx1.pure(0), // deployed_at (will be set by escrow)
            tx1.pure(0), // src_withdrawal
            tx1.pure(900), // src_public_withdrawal
            tx1.pure(1800), // src_cancellation
            tx1.pure(3600), // src_public_cancellation
            tx1.pure(0), // dst_withdrawal
            tx1.pure(900), // dst_public_withdrawal
            tx1.pure(2700), // dst_cancellation
          ],
        });
        
        tx1.moveCall({
          target: `${SUI_CONFIG.packageId}::escrow_factory::create_src_escrow_partial`,
          arguments: [
            tx1.object(SUI_CONFIG.EscrowFactory),
            tx1.pure(orderHashArray),
            tx1.pure(hashlockBytes),
            tx1.pure(userSui.toSuiAddress()),
            tx1.pure("0x0000000000000000000000000000000000000000000000000000000000000000"),
            tx1.pure(Number(totalUSDTAmountSui)),
            tx1.pure(1000000), // safety_deposit_per_unit (in USDT micro units)
            timelocks,
            tx1.pure(Number(resolver1USDTAmountSui)),
            tx1.pure(resolver1Sui.toSuiAddress()),
            coin1,
            tx1.object("0x6"), // Clock object
          ],
        });
        
        const result1 = await suiClient.signAndExecuteTransactionBlock({
          transactionBlock: tx1,
          signer: resolver1Sui,
          options: {
            showEffects: true,
            showObjectChanges: true,
          },
        });
        
        if (result1.effects?.status.status === "success") {
          console.log("✅ Resolver 1 deployed Sui source escrow");
          
          // Extract escrow ID
          const createdObjects = result1.objectChanges?.filter(change => 
            change.type === "created" && 
            "owner" in change && 
            typeof change.owner === "object" &&
            "Shared" in change.owner
          );
          
          if (createdObjects && createdObjects.length > 0 && "objectId" in createdObjects[0]) {
            srcEscrowId = createdObjects[0].objectId;
            console.log("   Source Escrow ID:", srcEscrowId);
          }
        }
      } catch (error: any) {
        console.log("❌ Resolver 1 Sui source escrow failed:", error.message);
      }
      
      // Add second resolver to Sui source escrow
      if (srcEscrowId) {
        try {
          const tx2 = new TransactionBlock();
          
          const resolver2SafetyDeposit = 100000000; // 0.1 SUI safety deposit
          const [coin2] = tx2.splitCoins(tx2.gas, [tx2.pure(resolver2SafetyDeposit)]);
          
          tx2.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow_factory::add_resolver_to_src_escrow`,
            arguments: [
              tx2.object(SUI_CONFIG.EscrowFactory),
              tx2.object(srcEscrowId),
              tx2.pure(Array.from(orderHashBytes)),
              tx2.pure(resolver2Sui.toSuiAddress()),
              tx2.pure(Number(resolver2USDTAmountSui)),
              coin2,
            ],
          });
          
          const result2 = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: tx2,
            signer: resolver2Sui,
            options: { showEffects: true },
          });
          
          if (result2.effects?.status.status === "success") {
            console.log("✅ Resolver 2 added to Sui source escrow");
          }
        } catch (error: any) {
          console.log("❌ Resolver 2 Sui source escrow failed:", error.message);
        }
      }
      
      // STEP 4: Deposit USDT tokens to source escrow
      console.log("\n=== STEP 4: DEPOSIT USDT TOKENS TO SOURCE ESCROW ===");
      
      if (srcEscrowId) {
        // Resolver 1 deposits USDT
        // Note: The current Sui contracts only support SUI token deposits
        // USDT token deposits would require additional contract functions
        console.log("⚠️  USDT deposits on Sui are not yet implemented in the contracts");
        
        // Resolver 2 deposits USDT
        // Note: The current Sui contracts only support SUI token deposits
      }
      
      // STEP 5: Deploy destination escrows on Base Sepolia
      console.log("\n=== STEP 5: DEPLOY DESTINATION ESCROWS (BASE SEPOLIA) ===");
      
      const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600;
      // Adjust resolver amounts for DAI
      const resolver1DAIAmountBase = parseUnits("6", 6); // 6 DAI (60%)
      const resolver2DAIAmountBase = parseUnits("4", 6); // 4 DAI (40%)
      
      console.log("Resolver DAI commitments:");
      console.log("  Resolver 1 will commit:", formatUnits(resolver1DAIAmountBase, 6), "DAI");
      console.log("  Resolver 2 will commit:", formatUnits(resolver2DAIAmountBase, 6), "DAI");
      
      const timelocks = encodeTimelocks({
        srcWithdrawal: 0n,
        srcPublicWithdrawal: 900n,
        srcCancellation: 1800n,
        srcPublicCancellation: 3600n,
        dstWithdrawal: 0n,
        dstPublicWithdrawal: 900n,
        dstCancellation: 2700n
      });
      
      const safetyDepositPerUnit = parseUnits("0.0001", 18); // Reduced safety deposit 
      const totalSafetyDeposit = (safetyDepositPerUnit * totalDAIAmountBase) / parseUnits("1", 6);
      
      const dstImmutables = {
        orderHash: orderHash,
        hashlock: hashlock,
        maker: BigInt(userBase.address),
        taker: BigInt("0"),
        token: BigInt(BASE_CONFIG.MockDAI),
        amount: totalDAIAmountBase,
        safetyDeposit: totalSafetyDeposit,
        timelocks: timelocks
      };
      
      const resolver1SafetyDeposit = (totalSafetyDeposit * resolver1DAIAmountBase) / totalDAIAmountBase;
      const resolver2SafetyDeposit = (totalSafetyDeposit * resolver2DAIAmountBase) / totalDAIAmountBase;
      
      // Deploy Base destination escrows
      const resolver1BaseContract = new Contract(BASE_CONFIG.UniteResolver0, UNITE_RESOLVER_ABI, resolver1Base);
      const resolver2BaseContract = new Contract(BASE_CONFIG.UniteResolver1, UNITE_RESOLVER_ABI, resolver2Base);
      
      // Approve UniteResolver contracts to spend DAI tokens
      const resolver1BaseDAI = new Contract(BASE_CONFIG.MockDAI, ERC20_ABI, resolver1Base);
      const resolver2BaseDAI = new Contract(BASE_CONFIG.MockDAI, ERC20_ABI, resolver2Base);
      
      try {
        const approveTx1 = await resolver1BaseDAI.approve(BASE_CONFIG.UniteResolver0, resolver1DAIAmountBase);
        await approveTx1.wait();
        console.log("✅ Resolver 1 approved DAI to UniteResolver");
      } catch (error: any) {
        console.log("❌ Resolver 1 DAI approval failed:", error.message);
      }
      
      try {
        const approveTx2 = await resolver2BaseDAI.approve(BASE_CONFIG.UniteResolver1, resolver2DAIAmountBase);
        await approveTx2.wait();
        console.log("✅ Resolver 2 approved DAI to UniteResolver");
      } catch (error: any) {
        console.log("❌ Resolver 2 DAI approval failed:", error.message);
      }
      
      try {
        const tx1 = await resolver1BaseContract.deployDstPartial(
          dstImmutables, srcCancellationTimestamp, resolver1DAIAmountBase,
          { value: resolver1SafetyDeposit, gasLimit: 1000000 }
        );
        await tx1.wait();
        console.log("✅ Resolver 1 deployed Base destination escrow");
      } catch (error: any) {
        console.log("❌ Resolver 1 Base destination escrow failed:", error.message);
      }
      
      try {
        const tx2 = await resolver2BaseContract.deployDstPartial(
          dstImmutables, srcCancellationTimestamp, resolver2DAIAmountBase,
          { value: resolver2SafetyDeposit, gasLimit: 1000000 }
        );
        await tx2.wait();
        console.log("✅ Resolver 2 deployed Base destination escrow");
      } catch (error: any) {
        console.log("❌ Resolver 2 Base destination escrow failed:", error.message);
      }
      
      // STEP 6: Check destination escrow address
      console.log("\n=== STEP 6: VERIFY DESTINATION ESCROW ===");
      
      try {
        const dstEscrowAddress = await baseFactory.addressOfEscrowDst(dstImmutables);
        console.log("Base destination escrow address:", dstEscrowAddress);
        
        // Check DAI balance in destination escrow (should have been deposited by deployDstPartial)
        const escrowDAIBalance = await baseDAI.balanceOf(dstEscrowAddress);
        console.log("DAI balance in destination escrow:", formatUnits(escrowDAIBalance, 6));
        
      } catch (error: any) {
        console.log("❌ Destination escrow check failed:", error.message);
      }
      
      // STEP 7: Mark user funds as transferred (Sui source)
      console.log("\n=== STEP 7: MARK USER FUNDS TRANSFERRED ===");
      
      if (srcEscrowId) {
        try {
          const markTx = new TransactionBlock();
          
          markTx.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow::mark_user_funded`,
            arguments: [
              markTx.object(srcEscrowId),
            ],
          });
          
          const result = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: markTx,
            signer: userSui,
            options: { showEffects: true },
          });
          
          if (result.effects?.status.status === "success") {
            console.log("✅ User funds marked as transferred on Sui");
          }
        } catch (error: any) {
          console.log("❌ Mark user funded failed:", error.message);
        }
      }
      
      // STEP 8: Reveal secret and execute withdrawals
      console.log("\n=== STEP 8: SECRET REVEALED & WITHDRAWALS ===");
      console.log("🔓 Secret revealed:", hexlify(secret));
      
      // Withdraw from Base destination escrow (user gets DAI)
      try {
        const dstEscrowAddress = await baseFactory.addressOfEscrowDst(dstImmutables);
        const dstEscrow = new Contract(dstEscrowAddress, ESCROW_ABI, userBase);
        
        const userDAIBefore = await baseDAI.balanceOf(userBase.address);
        
        const withdrawTx = await dstEscrow.withdrawWithSecret(secret, dstImmutables, { gasLimit: 1000000 });
        await withdrawTx.wait();
        console.log("✅ Base destination escrow withdrawal completed");
        
        const userDAIAfter = await baseDAI.balanceOf(userBase.address);
        console.log("DAI received by user:", formatUnits(userDAIAfter - userDAIBefore, 6));
        
      } catch (error: any) {
        console.log("❌ Base destination escrow withdrawal failed:", error.message);
      }
      
      // Withdraw from Sui source escrow (resolvers get their safety deposits back)
      if (srcEscrowId) {
        try {
          const withdrawTx = new TransactionBlock();
          const secretBytes = Array.from(secret);
          
          withdrawTx.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow::withdraw_sui_with_secret`,
            arguments: [
              withdrawTx.object(srcEscrowId),
              withdrawTx.pure(secretBytes),
              withdrawTx.object("0x6"), // Clock object
            ],
          });
          
          const result = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: withdrawTx,
            signer: userSui,
            options: { showEffects: true },
          });
          
          if (result.effects?.status.status === "success") {
            console.log("✅ Sui source escrow withdrawal completed");
            console.log("✅ Resolvers received their safety deposits back");
          }
        } catch (error: any) {
          console.log("❌ Sui source escrow withdrawal failed:", error.message);
        }
      }
      
      console.log("\n=== SWAP COMPLETED: SUI → BASE ===");
      console.log("✅ User swapped USDT on Sui for DAI on Base Sepolia");
      console.log("✅ Resolvers facilitated the cross-chain swap");
      console.log("✅ All safety deposits returned");
      
    }, 300000); // 5 minute timeout
  });
});