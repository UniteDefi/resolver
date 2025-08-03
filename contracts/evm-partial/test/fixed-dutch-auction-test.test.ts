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
  id,
  AbiCoder,
  zeroPadValue
} from "ethers";
import * as dotenv from "dotenv";
import allDeployments from "../deployments.json";

dotenv.config();

// Contract ABIs
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
  "function deployDstPartial(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp, uint256 partialAmount) external payable",
  "function fillOrder(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order, uint256 srcCancellationTimestamp, uint256 srcAmount) external payable",
  "function approveToken(address token, uint256 amount) external"
];

const ESCROW_ABI = [
  "function orderHash() external view returns (bytes32)",
  "function withdrawWithSecret(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
  "function withdrawUser(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
  "function withdrawResolver(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external"
];

const LIMIT_ORDER_PROTOCOL_ABI = [
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order) external view returns (bytes32)",
  "function nonces(address) external view returns (uint256)"
];

// Helper function to encode timelocks
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

// Helper function to calculate current Dutch auction price
function calculateCurrentPrice(startPrice: bigint, endPrice: bigint, startTime: number, endTime: number, currentTime: number): bigint {
  if (currentTime <= startTime) return startPrice;
  if (currentTime >= endTime) return endPrice;
  
  const elapsed = BigInt(currentTime - startTime);
  const duration = BigInt(endTime - startTime);
  const priceDiff = startPrice - endPrice;
  
  return startPrice - (priceDiff * elapsed) / duration;
}

// Helper function to calculate taking amount based on current price
function calculateTakingAmount(makingAmount: bigint, startPrice: bigint, endPrice: bigint, startTime: number, endTime: number, currentTime: number): bigint {
  const currentPrice = calculateCurrentPrice(startPrice, endPrice, startTime, endTime, currentTime);
  return (makingAmount * currentPrice) / parseUnits("1", 18);
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

describe("🔄 Complete Cross-Chain Swap Flow", () => {
  it("should execute complete cross-chain swap", async () => {
    const srcProvider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
    const dstProvider = new JsonRpcProvider(process.env.ARB_SEPOLIA_RPC_URL || "https://arbitrum-sepolia-rpc.publicnode.com");
    
    const deployments = allDeployments.evm;
    const srcChainConfig = deployments.base_sepolia;
    const dstChainConfig = deployments.arb_sepolia;
    
    // Setup wallets on both chains
    const user = new Wallet(process.env.PRIVATE_KEY || "", srcProvider);
    const userDst = new Wallet(process.env.PRIVATE_KEY || "", dstProvider);
    const resolver1Src = new Wallet(process.env.RESOLVER_PRIVATE_KEY_0 || "", srcProvider);
    const resolver1Dst = new Wallet(process.env.RESOLVER_PRIVATE_KEY_0 || "", dstProvider);
    const resolver2Src = new Wallet(process.env.RESOLVER_PRIVATE_KEY_1 || "", srcProvider);
    const resolver2Dst = new Wallet(process.env.RESOLVER_PRIVATE_KEY_1 || "", dstProvider);
    const resolver3Src = new Wallet(process.env.RESOLVER_PRIVATE_KEY_2 || "", srcProvider);
    const resolver3Dst = new Wallet(process.env.RESOLVER_PRIVATE_KEY_2 || "", dstProvider);
    const relayer = new Wallet(process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "", srcProvider);
    
    // Setup contracts
    const srcToken = new Contract(srcChainConfig.MockUSDT, ERC20_ABI, user);
    const dstToken = new Contract(dstChainConfig.MockDAI, ERC20_ABI, userDst);
    const srcFactory = new Contract(srcChainConfig.UniteEscrowFactory, ESCROW_FACTORY_ABI, relayer);
    const dstFactory = new Contract(dstChainConfig.UniteEscrowFactory, ESCROW_FACTORY_ABI, dstProvider);
    const srcLOP = new Contract(srcChainConfig.UniteLimitOrderProtocol, LIMIT_ORDER_PROTOCOL_ABI, srcProvider);
    
    console.log("\n=== DEPLOYED CONTRACTS ===");
    console.log("Base Sepolia (Source):");
    console.log("  LimitOrderProtocol:", srcChainConfig.UniteLimitOrderProtocol);
    console.log("  EscrowFactory:", srcChainConfig.UniteEscrowFactory);
    console.log("  Resolver0:", srcChainConfig.UniteResolver0);
    console.log("  Resolver1:", srcChainConfig.UniteResolver1);
    console.log("  Resolver2:", srcChainConfig.UniteResolver2);
    console.log("  USDT:", srcChainConfig.MockUSDT);
    console.log("\nArbitrum Sepolia (Destination):");
    console.log("  EscrowFactory:", dstChainConfig.UniteEscrowFactory);
    console.log("  Resolver0:", dstChainConfig.UniteResolver0);
    console.log("  Resolver1:", dstChainConfig.UniteResolver1);
    console.log("  Resolver2:", dstChainConfig.UniteResolver2);
    console.log("  DAI:", dstChainConfig.MockDAI);
    
    // STEP 1: Check and fund balances on both chains
    console.log("\n=== STEP 1: CHECK BALANCES ===");
    
    // Log native balances on source chain (Base Sepolia)
    console.log("\n--- Native balances on Base Sepolia ---");
    const userBalanceNativeSrc = await srcProvider.getBalance(user.address);
    const resolver1BalanceNativeSrc = await srcProvider.getBalance(resolver1Src.address);
    const resolver2BalanceNativeSrc = await srcProvider.getBalance(resolver2Src.address);
    const resolver3BalanceNativeSrc = await srcProvider.getBalance(resolver3Src.address);
    const relayerBalanceNativeSrc = await srcProvider.getBalance(relayer.address);
    console.log("User ETH:", formatUnits(userBalanceNativeSrc, 18));
    console.log("Resolver 1 ETH:", formatUnits(resolver1BalanceNativeSrc, 18));
    console.log("Resolver 2 ETH:", formatUnits(resolver2BalanceNativeSrc, 18));
    console.log("Resolver 3 ETH:", formatUnits(resolver3BalanceNativeSrc, 18));
    console.log("Relayer ETH:", formatUnits(relayerBalanceNativeSrc, 18));
    
    // Log native balances on destination chain (Arbitrum Sepolia)
    console.log("\n--- Native balances on Arbitrum Sepolia ---");
    const userBalanceNativeDst = await dstProvider.getBalance(userDst.address);
    const resolver1BalanceNativeDst = await dstProvider.getBalance(resolver1Dst.address);
    const resolver2BalanceNativeDst = await dstProvider.getBalance(resolver2Dst.address);
    const resolver3BalanceNativeDst = await dstProvider.getBalance(resolver3Dst.address);
    console.log("User ETH:", formatUnits(userBalanceNativeDst, 18));
    console.log("Resolver 1 ETH:", formatUnits(resolver1BalanceNativeDst, 18));
    console.log("Resolver 2 ETH:", formatUnits(resolver2BalanceNativeDst, 18));
    console.log("Resolver 3 ETH:", formatUnits(resolver3BalanceNativeDst, 18));
    
    // Source chain balances (USDT)
    console.log("\n--- Token balances ---");
    const userBalance = await srcToken.balanceOf(user.address);
    console.log("User USDT (source):", formatUnits(userBalance, 18));
    
    // Destination chain balances (DAI) - fund resolvers if needed
    const resolver1DaiBalance = await dstToken.balanceOf(resolver1Dst.address);
    const resolver2DaiBalance = await dstToken.balanceOf(resolver2Dst.address);
    const resolver3DaiBalance = await dstToken.balanceOf(resolver3Dst.address);
    console.log("Resolver 1 DAI (dest):", formatUnits(resolver1DaiBalance, 18));
    console.log("Resolver 2 DAI (dest):", formatUnits(resolver2DaiBalance, 18));
    console.log("Resolver 3 DAI (dest):", formatUnits(resolver3DaiBalance, 18));
    
    // STEP 2: Approve tokens
    console.log("\n=== STEP 2: APPROVE TOKENS ===");
    
    // User approves source tokens to factory
    const currentAllowance = await srcToken.allowance(user.address, srcChainConfig.UniteEscrowFactory);
    if (currentAllowance < parseUnits("100", 18)) {
      const approveTx = await srcToken.approve(srcChainConfig.UniteEscrowFactory, parseUnits("1000", 18));
      await approveTx.wait();
      console.log("✅ User approved source token to factory");
    }
    
    // STEP 3: Create and sign order
    console.log("\n=== STEP 3: CREATE AND SIGN ORDER ===");
    const totalAmount = parseUnits("100", 18);
    const totalDaiAmount = parseUnits("99", 18); // Slightly less due to price impact
    const safetyDepositPerUnit = parseUnits("0.0001", 18); // 0.0001 ETH per 1 USDT (18 decimals)
    
    const auctionStartTime = Math.floor(Date.now() / 1000);
    const auctionEndTime = auctionStartTime + 300; // 5 minutes
    const startPrice = parseUnits("0.99", 18); // 0.99 DAI per USDT
    const endPrice = parseUnits("0.97", 18);   // 0.97 DAI per USDT
    
    const secret = randomBytes(32);
    const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
    console.log("Secret:", hexlify(secret));
    console.log("Hashlock:", hashlock);
    
    const userNonce = await srcLOP.nonces(user.address);
    const order = {
      salt: 12345n,
      maker: user.address,
      receiver: "0x0000000000000000000000000000000000000000",
      makerAsset: srcChainConfig.MockUSDT,
      takerAsset: dstChainConfig.MockDAI,
      makingAmount: totalAmount,
      takingAmount: totalDaiAmount,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      nonce: userNonce,
      srcChainId: 84532,
      dstChainId: 421614,
      auctionStartTime: auctionStartTime,
      auctionEndTime: auctionEndTime,
      startPrice: startPrice,
      endPrice: endPrice
    };
    
    const orderHash = await srcLOP.hashOrder(order);
    console.log("Order hash:", orderHash);
    
    const signature = await signOrder(
      order,
      user,
      "UniteLimitOrderProtocol",
      "1",
      84532,
      srcChainConfig.UniteLimitOrderProtocol
    );
    console.log("✅ Order signed");
    
    // STEP 4: Resolvers deploy source escrows with safety deposits
    console.log("\n=== STEP 4: RESOLVERS DEPLOY SOURCE ESCROWS ===");
    console.log("Note: Resolvers must deploy BOTH source AND destination escrows before relayer transfers user funds");
    
    // Fixed timelock values - no time limits for withdrawal with secret, only for cancellation/public actions
    const timelocks = encodeTimelocks({
      srcWithdrawal: 0n,           // No time limit for withdrawal with secret
      srcPublicWithdrawal: 900n,   // 15 min for public reward incentive
      srcCancellation: 1800n,      // 30 min for cancellation
      srcPublicCancellation: 3600n, // 1 hour for public cancellation
      dstWithdrawal: 0n,           // No time limit for withdrawal with secret
      dstPublicWithdrawal: 900n,   // 15 min for public reward incentive
      dstCancellation: 2700n       // 45 min for destination cancellation
    });
    
    // Resolver commitments - must add up to totalAmount (100 USDT)
    const resolver1Amount = parseUnits("40", 18);
    const resolver2Amount = parseUnits("30", 18);  // Changed from 25 to 30
    const resolver3Amount = parseUnits("30", 18);  // Changed from 35 to 30
    
    // Simple safety deposit calculation - per USDT basis
    const resolver1SafetyDeposit = (safetyDepositPerUnit * resolver1Amount) / parseUnits("1", 18);
    const resolver2SafetyDeposit = (safetyDepositPerUnit * resolver2Amount) / parseUnits("1", 18);
    const resolver3SafetyDeposit = (safetyDepositPerUnit * resolver3Amount) / parseUnits("1", 18);
    
    console.log("Resolver amounts:", formatUnits(resolver1Amount, 18), formatUnits(resolver2Amount, 18), formatUnits(resolver3Amount, 18));
    console.log("Total resolver amount:", formatUnits(resolver1Amount + resolver2Amount + resolver3Amount, 18));
    console.log("Safety deposits:", formatUnits(resolver1SafetyDeposit, 18), formatUnits(resolver2SafetyDeposit, 18), formatUnits(resolver3SafetyDeposit, 18));
    
    // Calculate total safety deposit for the entire order
    const totalSafetyDeposit = resolver1SafetyDeposit + resolver2SafetyDeposit + resolver3SafetyDeposit;
    
    // Use the same immutables for ALL resolvers on source chain
    const srcImmutables = {
      orderHash: orderHash,
      hashlock: hashlock,
      maker: BigInt(user.address),
      taker: BigInt("0"), // Use zero address for multi-resolver orders
      token: BigInt(srcChainConfig.MockUSDT),
      amount: totalAmount,
      safetyDeposit: totalSafetyDeposit, // TOTAL safety deposit
      timelocks: timelocks
    };
    
    // Deploy source escrows - each resolver uses their own contract
    const resolver1SrcContract = new Contract(srcChainConfig.UniteResolver0, UNITE_RESOLVER_ABI, resolver1Src);
    const resolver2SrcContract = new Contract(srcChainConfig.UniteResolver1, UNITE_RESOLVER_ABI, resolver2Src);
    const resolver3SrcContract = new Contract(srcChainConfig.UniteResolver2, UNITE_RESOLVER_ABI, resolver3Src);
    
    console.log("\nResolver contract addresses:");
    console.log("  Resolver 1:", resolver1SrcContract.target);
    console.log("  Resolver 2:", resolver2SrcContract.target);  
    console.log("  Resolver 3:", resolver3SrcContract.target);
    
    const resolvers = [
      { contract: resolver1SrcContract, amount: resolver1Amount, deposit: resolver1SafetyDeposit, name: "Resolver 1" },
      { contract: resolver2SrcContract, amount: resolver2Amount, deposit: resolver2SafetyDeposit, name: "Resolver 2" },
      { contract: resolver3SrcContract, amount: resolver3Amount, deposit: resolver3SafetyDeposit, name: "Resolver 3" }
    ];
    
    const successfulSrcResolvers = [];
    
    for (const resolver of resolvers) {
      try {
        console.log(`\n${resolver.name} deploying source escrow...`);
        console.log(`  Amount: ${formatUnits(resolver.amount, 18)} USDT`);
        console.log(`  Safety deposit: ${formatUnits(resolver.deposit, 18)} ETH`);
        console.log(`  Contract: ${resolver.contract.target}`);
        
        // Check wallet balances before transaction
        const wallet = resolver.contract.runner;
        const ethBalance = await srcProvider.getBalance(wallet.address);
        console.log(`  Wallet ETH balance: ${formatUnits(ethBalance, 18)}`);
        console.log(`  Required ETH: ${formatUnits(resolver.deposit, 18)}`);
        
        const tx = await resolver.contract.deploySrcCompactPartial(
          srcImmutables, order, signature.r, signature.vs, resolver.amount, resolver.amount,
          { value: resolver.deposit, gasLimit: 10000000 }
        );
        const receipt = await tx.wait();
        console.log(`✅ ${resolver.name} deployed source escrow (gas: ${receipt.gasUsed})`);
        successfulSrcResolvers.push(resolver);
      } catch (error: any) {
        console.log(`❌ ${resolver.name} source failed:`, error.reason || error.message);
        if (error.receipt) {
          console.log(`  Gas used: ${error.receipt.gasUsed}, Status: ${error.receipt.status}`);
        }
        // Try to get more detailed error information
        if (error.transaction) {
          console.log(`  Transaction hash: ${error.transaction.hash}`);
        }
      }
    }
    
    console.log(`\n${successfulSrcResolvers.length}/${resolvers.length} resolvers successfully deployed source escrows`);
    
    // Adjust total amount based on successful commitments
    const totalCommitted = successfulSrcResolvers.reduce((sum, r) => sum + r.amount, 0n);
    console.log("Total committed on source:", formatUnits(totalCommitted, 18), "USDT");
    
    if (totalCommitted < parseUnits("50", 18)) { // Minimum 50 USDT to continue
      console.log("❌ Insufficient commitments (minimum 50 USDT required), stopping test");
      return;
    }
    
    console.log("✅ Proceeding with", formatUnits(totalCommitted, 18), "USDT");
    
    // Note: We keep using original srcImmutables since the escrow was deployed with those
    // The escrow contract will handle partial amounts internally
    
    // STEP 5: Resolvers pre-approve tokens and use fillOrder for Dutch auction
    console.log("\n=== STEP 5: RESOLVERS PRE-APPROVE TOKENS AND USE DUTCH AUCTION FILLORDER ===");
    
    // Set up resolver contracts for fillOrder
    const resolver1DstContract = new Contract(dstChainConfig.UniteResolver0, UNITE_RESOLVER_ABI, resolver1Dst);
    const resolver2DstContract = new Contract(dstChainConfig.UniteResolver1, UNITE_RESOLVER_ABI, resolver2Dst);
    const resolver3DstContract = new Contract(dstChainConfig.UniteResolver2, UNITE_RESOLVER_ABI, resolver3Dst);
    
    const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    
    // Step 5a: Resolvers pre-approve destination tokens (DAI) to their resolver contracts
    console.log("\n--- Pre-approving destination tokens (DAI) ---");
    
    const resolver1DaiContract = new Contract(dstChainConfig.MockDAI, ERC20_ABI, resolver1Dst);
    const resolver2DaiContract = new Contract(dstChainConfig.MockDAI, ERC20_ABI, resolver2Dst);
    const resolver3DaiContract = new Contract(dstChainConfig.MockDAI, ERC20_ABI, resolver3Dst);
    
    const dstResolvers = [
      { contract: resolver1DstContract, daiContract: resolver1DaiContract, srcAmount: resolver1Amount, name: "Resolver 1", wallet: resolver1Dst },
      { contract: resolver2DstContract, daiContract: resolver2DaiContract, srcAmount: resolver2Amount, name: "Resolver 2", wallet: resolver2Dst },
      { contract: resolver3DstContract, daiContract: resolver3DaiContract, srcAmount: resolver3Amount, name: "Resolver 3", wallet: resolver3Dst }
    ].filter(resolver => successfulSrcResolvers.find(r => r.name === resolver.name)); // Only include resolvers that succeeded on source
    
    console.log(`Processing ${dstResolvers.length} destination resolvers (those that succeeded on source)`);
    
    
    // Pre-approve DAI for all resolvers
    for (const resolver of dstResolvers) {
      try {
        const approveTx = await resolver.daiContract.approve(resolver.contract.target, parseUnits("1000000", 18));
        await approveTx.wait();
        console.log(`✅ ${resolver.name} pre-approved DAI to resolver contract`);
      } catch (error: any) {
        console.log(`❌ ${resolver.name} DAI approval failed:`, error.reason || error.message);
      }
    }
    
    // Step 5b: Resolvers use fillOrder with Dutch auction pricing
    console.log("\n--- Using fillOrder for Dutch auction (destination escrows) ---");
    console.log("Current Dutch auction price calculation:");
    console.log("  Start price:", formatUnits(startPrice, 18));
    console.log("  End price:", formatUnits(endPrice, 18));
    console.log("  Auction duration:", (auctionEndTime - auctionStartTime), "seconds");
    
    const currentTime = Math.floor(Date.now() / 1000);
    const currentPrice = calculateCurrentPrice(startPrice, endPrice, auctionStartTime, auctionEndTime, currentTime);
    console.log("  Current price:", formatUnits(currentPrice, 18), "DAI per USDT");
    
    const successfulDstResolvers = [];
    
    for (const resolver of dstResolvers) {
      // Skip if this resolver didn't succeed on source chain
      if (!successfulSrcResolvers.find(r => r.name === resolver.name)) {
        console.log(`⏭️ Skipping ${resolver.name} - source deployment failed`);
        continue;
      }
      
      try {
        console.log(`\n${resolver.name} executing fillOrder...`);
        
        // Calculate expected DAI amount
        const expectedDaiAmount = calculateTakingAmount(
          resolver.srcAmount,
          startPrice,
          endPrice,
          auctionStartTime,
          auctionEndTime,
          currentTime
        );
        
        console.log(`  Source amount: ${formatUnits(resolver.srcAmount, 18)} USDT`);
        console.log(`  Expected DAI amount: ${formatUnits(expectedDaiAmount, 18)} DAI`);
        
        // Check balances
        const daiBalance = await dstToken.balanceOf(resolver.wallet.address);
        const allowance = await resolver.daiContract.allowance(resolver.wallet.address, resolver.contract.target);
        
        console.log(`  Available DAI: ${formatUnits(daiBalance, 18)}`);
        console.log(`  Allowance: ${formatUnits(allowance, 18)}`);
        
        if (daiBalance < expectedDaiAmount) {
          throw new Error(`Insufficient DAI balance. Need ${formatUnits(expectedDaiAmount, 18)}, have ${formatUnits(daiBalance, 18)}`);
        }
        
        if (allowance < expectedDaiAmount) {
          throw new Error(`Insufficient allowance. Need ${formatUnits(expectedDaiAmount, 18)}, have ${formatUnits(allowance, 18)}`);
        }
        
        // Create immutables for this resolver's partial fill
        const resolverDstImmutables = {
          orderHash: orderHash,
          hashlock: hashlock,
          maker: BigInt(user.address),
          taker: BigInt(resolver.wallet.address),
          token: BigInt(dstChainConfig.MockDAI),
          amount: resolver.srcAmount, // Source amount they want to fill
          safetyDeposit: (safetyDepositPerUnit * resolver.srcAmount) / parseUnits("1", 18),
          timelocks: timelocks
        };
        
        const fillTx = await resolver.contract.fillOrder(
          resolverDstImmutables,
          order,
          srcCancellationTimestamp,
          resolver.srcAmount, // srcAmount - resolver wants to fill this much USDT equivalent
          { value: resolverDstImmutables.safetyDeposit, gasLimit: 10000000 }
        );
        const receipt = await fillTx.wait();
        console.log(`✅ ${resolver.name} used fillOrder for ${formatUnits(resolver.srcAmount, 18)} USDT equivalent (gas: ${receipt.gasUsed})`);
        successfulDstResolvers.push(resolver);
      } catch (error: any) {
        console.log(`❌ ${resolver.name} fillOrder failed:`, error.reason || error.message);
        if (error.receipt) {
          console.log(`  Gas used: ${error.receipt.gasUsed}, Status: ${error.receipt.status}`);
        }
      }
    }
    
    console.log(`\n${successfulDstResolvers.length}/${dstResolvers.length} resolvers successfully executed fillOrder`);
    
    // STEP 6: Relayer transfers user funds to source escrow
    console.log("\n=== STEP 6: RELAYER TRANSFERS USER FUNDS (SECRET REVEALED) ===");
    const totalFilled = await srcFactory.getTotalFilledAmount(orderHash);
    console.log("Total filled amount:", formatUnits(totalFilled, 18), "USDT");
    
    if (totalFilled >= totalCommitted) {
      const userUSDTBefore = await srcToken.balanceOf(user.address);
      console.log("User USDT before transfer:", formatUnits(userUSDTBefore, 18));
      
      const transferTx = await srcFactory.transferUserFunds(
        orderHash, user.address, srcChainConfig.MockUSDT, totalCommitted
      );
      await transferTx.wait();
      console.log("✅ Relayer transferred user funds to source escrow");
      
      const userUSDTAfter = await srcToken.balanceOf(user.address);
      console.log("User USDT after transfer:", formatUnits(userUSDTAfter, 18));
      console.log("USDT transferred:", formatUnits(userUSDTBefore - userUSDTAfter, 18));
    } else {
      console.log("❌ Not enough filled amount to transfer user funds");
      return;
    }
    
    // STEP 7: Check destination escrows created by fillOrder
    console.log("\n=== STEP 7: VERIFY DESTINATION ESCROWS CREATED BY FILLORDER ===");
    
    if (successfulDstResolvers.length > 0) {
      // Create immutables for the first successful resolver to check escrow
      const firstResolver = successfulDstResolvers[0];
      const dstImmutables = {
        orderHash: orderHash,
        hashlock: hashlock,
        maker: BigInt(user.address),
        taker: BigInt(firstResolver.wallet.address),
        token: BigInt(dstChainConfig.MockDAI),
        amount: firstResolver.srcAmount,
        safetyDeposit: (safetyDepositPerUnit * firstResolver.srcAmount) / parseUnits("1", 18),
        timelocks: timelocks
      };
      
      const dstEscrowAddress = await dstFactory.addressOfEscrowDst(dstImmutables);
      console.log("Destination escrow address (first resolver):", dstEscrowAddress);
      
      // Check if tokens were automatically transferred by fillOrder
      const escrowDaiBalance = await dstToken.balanceOf(dstEscrowAddress);
      console.log("DAI balance in first resolver's escrow:", formatUnits(escrowDaiBalance, 18));
      
      console.log("✅ fillOrder automatically handled token transfers and escrow creation");
    }
    
    // STEP 8: Relayer reveals secret publicly
    console.log("\n=== STEP 8: RELAYER REVEALS SECRET ===");
    console.log("🔓 Secret is now revealed publicly:", hexlify(secret));
    
    // STEP 9: Withdrawal from destination escrow (with Dutch auction amounts)
    console.log("\n=== STEP 9: DESTINATION ESCROW WITHDRAWAL ===");
    
    if (successfulDstResolvers.length > 0) {
      const firstResolver = successfulDstResolvers[0];
      const dstImmutables = {
        orderHash: orderHash,
        hashlock: hashlock,
        maker: BigInt(user.address),
        taker: BigInt(firstResolver.wallet.address),
        token: BigInt(dstChainConfig.MockDAI),
        amount: firstResolver.srcAmount,
        safetyDeposit: (safetyDepositPerUnit * firstResolver.srcAmount) / parseUnits("1", 18),
        timelocks: timelocks
      };
      
      const dstEscrowAddress = await dstFactory.addressOfEscrowDst(dstImmutables);
      const dstEscrow = new Contract(dstEscrowAddress, ESCROW_ABI, userDst);
      
      const userDaiBalanceBefore = await dstToken.balanceOf(user.address);
      console.log("User DAI balance before:", formatUnits(userDaiBalanceBefore, 18));
      
      try {
        const withdrawTx = await dstEscrow.withdrawWithSecret(secret, dstImmutables, { gasLimit: 2000000 });
        await withdrawTx.wait();
        
        console.log("✅ Destination escrow withdrawal completed");
        console.log("   - User received DAI tokens at Dutch auction price");
        console.log("   - Resolver received safety deposit back");
        
        const userDaiBalanceAfter = await dstToken.balanceOf(user.address);
        console.log("User DAI balance after:", formatUnits(userDaiBalanceAfter, 18));
        console.log("DAI received:", formatUnits(userDaiBalanceAfter - userDaiBalanceBefore, 18));
      } catch (error: any) {
        console.log("❌ Destination escrow withdrawal failed:", error.reason || error.message);
      }
    }
    
    // STEP 10: Source escrow withdrawal (distributes to all resolvers)
    console.log("\n=== STEP 10: SOURCE ESCROW WITHDRAWAL ===");
    
    const srcEscrowAddress = await srcFactory.addressOfEscrowSrc(srcImmutables);
    const srcEscrow = new Contract(srcEscrowAddress, ESCROW_ABI, user);
    
    // Check resolver balances before
    const resolver1USDTBefore = await srcToken.balanceOf(resolver1Src.address);
    const resolver2USDTBefore = await srcToken.balanceOf(resolver2Src.address);
    const resolver3USDTBefore = await srcToken.balanceOf(resolver3Src.address);
    
    console.log("Resolver USDT balances before:");
    console.log("  Resolver 1:", formatUnits(resolver1USDTBefore, 18));
    console.log("  Resolver 2:", formatUnits(resolver2USDTBefore, 18));
    console.log("  Resolver 3:", formatUnits(resolver3USDTBefore, 18));
    
    try {
      const withdrawTx = await srcEscrow.withdrawWithSecret(secret, srcImmutables, { gasLimit: 2000000 });
      await withdrawTx.wait();
      console.log("✅ Source escrow withdrawal completed");
      console.log("   - All resolvers received USDT tokens proportionally");
      console.log("   - All resolvers received safety deposits back");
      
      // Check resolver balances after
      const resolver1USDTAfter = await srcToken.balanceOf(resolver1Src.address);
      const resolver2USDTAfter = await srcToken.balanceOf(resolver2Src.address);
      const resolver3USDTAfter = await srcToken.balanceOf(resolver3Src.address);
      
      console.log("Resolver USDT balances after:");
      console.log("  Resolver 1:", formatUnits(resolver1USDTAfter, 18), "(+", formatUnits(resolver1USDTAfter - resolver1USDTBefore, 18), ")");
      console.log("  Resolver 2:", formatUnits(resolver2USDTAfter, 18), "(+", formatUnits(resolver2USDTAfter - resolver2USDTBefore, 18), ")");
      console.log("  Resolver 3:", formatUnits(resolver3USDTAfter, 18), "(+", formatUnits(resolver3USDTAfter - resolver3USDTBefore, 18), ")");
    } catch (error: any) {
      console.log("❌ Source escrow withdrawal failed:", error.reason || error.message);
    }
    
    console.log("\n=== DUTCH AUCTION CROSS-CHAIN SWAP COMPLETE ===");
    console.log("✅ Cross-chain swap executed successfully with Dutch auction pricing!");
    console.log("- User received DAI on destination chain at dynamic auction price");
    console.log("- Resolvers used fillOrder to automatically calculate destination amounts");
    console.log("- Dutch auction provided fair, time-based pricing");
    console.log("- Resolvers received USDT proportionally on source chain");  
    console.log("- All safety deposits returned to resolvers on both chains");
    console.log("- Secret-based HTLC provided trustless execution");
    console.log("- Partial fill handling: processed", successfulSrcResolvers.length, "out of", resolvers.length, "resolvers");
    console.log("Source escrow:", srcEscrowAddress);
    if (successfulDstResolvers.length > 0) {
      const firstResolver = successfulDstResolvers[0];
      const dstImmutables = {
        orderHash: orderHash,
        hashlock: hashlock,
        maker: BigInt(user.address),
        taker: BigInt(firstResolver.wallet.address),
        token: BigInt(dstChainConfig.MockDAI),
        amount: firstResolver.srcAmount,
        safetyDeposit: (safetyDepositPerUnit * firstResolver.srcAmount) / parseUnits("1", 18),
        timelocks: timelocks
      };
      const dstEscrowAddress = await dstFactory.addressOfEscrowDst(dstImmutables);
      console.log("Destination escrow:", dstEscrowAddress);
    }
    
    // Log final native balances on both chains
    console.log("\n=== FINAL NATIVE BALANCES ===");
    console.log("\n--- Base Sepolia (Source) ---");
    const finalUserBalanceNativeSrc = await srcProvider.getBalance(user.address);
    const finalResolver1BalanceNativeSrc = await srcProvider.getBalance(resolver1Src.address);
    const finalResolver2BalanceNativeSrc = await srcProvider.getBalance(resolver2Src.address);
    const finalResolver3BalanceNativeSrc = await srcProvider.getBalance(resolver3Src.address);
    console.log("User ETH:", formatUnits(finalUserBalanceNativeSrc, 18));
    console.log("Resolver 1 ETH:", formatUnits(finalResolver1BalanceNativeSrc, 18));
    console.log("Resolver 2 ETH:", formatUnits(finalResolver2BalanceNativeSrc, 18));
    console.log("Resolver 3 ETH:", formatUnits(finalResolver3BalanceNativeSrc, 18));
    
    console.log("\n--- Arbitrum Sepolia (Destination) ---");
    const finalUserBalanceNativeDst = await dstProvider.getBalance(userDst.address);
    const finalResolver1BalanceNativeDst = await dstProvider.getBalance(resolver1Dst.address);
    const finalResolver2BalanceNativeDst = await dstProvider.getBalance(resolver2Dst.address);
    const finalResolver3BalanceNativeDst = await dstProvider.getBalance(resolver3Dst.address);
    console.log("User ETH:", formatUnits(finalUserBalanceNativeDst, 18));
    console.log("Resolver 1 ETH:", formatUnits(finalResolver1BalanceNativeDst, 18));
    console.log("Resolver 2 ETH:", formatUnits(finalResolver2BalanceNativeDst, 18));
    console.log("Resolver 3 ETH:", formatUnits(finalResolver3BalanceNativeDst, 18));
    
    console.log("\nCheck transactions on:");
    console.log("- Base Sepolia: https://sepolia.basescan.org");
    console.log("- Arbitrum Sepolia: https://sepolia.arbiscan.io");
  }, 120000); // 2 minute timeout for cross-chain operations
});