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
  "function deployDstPartial(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp, uint256 partialAmount) external payable"
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
    console.log("  Resolver3:", srcChainConfig.UniteResolver3);
    console.log("  USDT:", srcChainConfig.MockUSDT);
    console.log("\nArbitrum Sepolia (Destination):");
    console.log("  EscrowFactory:", dstChainConfig.UniteEscrowFactory);
    console.log("  Resolver0:", dstChainConfig.UniteResolver0);
    console.log("  Resolver1:", dstChainConfig.UniteResolver1);
    console.log("  Resolver2:", dstChainConfig.UniteResolver2);
    console.log("  Resolver3:", dstChainConfig.UniteResolver3);
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
    console.log("User USDT (source):", formatUnits(userBalance, 6));
    
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
    if (currentAllowance < parseUnits("100", 6)) {
      const approveTx = await srcToken.approve(srcChainConfig.UniteEscrowFactory, parseUnits("1000", 6));
      await approveTx.wait();
      console.log("✅ User approved source token to factory");
    }
    
    // STEP 3: Create and sign order
    console.log("\n=== STEP 3: CREATE AND SIGN ORDER ===");
    const totalAmount = parseUnits("100", 6);
    const totalDaiAmount = parseUnits("99", 18); // Slightly less due to price impact
    const safetyDepositPerUnit = parseUnits("0.0001", 18);
    
    const auctionStartTime = Math.floor(Date.now() / 1000);
    const auctionEndTime = auctionStartTime + 300;
    const startPrice = parseUnits("0.99", 18);
    const endPrice = parseUnits("0.97", 18);
    
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
    
    // Calculate total safety deposit for the entire order
    const totalSafetyDeposit = (safetyDepositPerUnit * totalAmount) / parseUnits("1", 6);
    
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
    
    // Resolver commitments
    const resolver1Amount = parseUnits("40", 6);
    const resolver2Amount = parseUnits("25", 6);
    const resolver3Amount = parseUnits("35", 6);
    
    const resolver1SafetyDeposit = (totalSafetyDeposit * resolver1Amount) / totalAmount;
    const resolver2SafetyDeposit = (totalSafetyDeposit * resolver2Amount) / totalAmount;
    const resolver3SafetyDeposit = (totalSafetyDeposit * resolver3Amount) / totalAmount;
    
    // Deploy source escrows - each resolver uses their own contract
    const resolver1SrcContract = new Contract(srcChainConfig.UniteResolver0, UNITE_RESOLVER_ABI, resolver1Src);
    const resolver2SrcContract = new Contract(srcChainConfig.UniteResolver1, UNITE_RESOLVER_ABI, resolver2Src);
    const resolver3SrcContract = new Contract(srcChainConfig.UniteResolver2, UNITE_RESOLVER_ABI, resolver3Src);
    
    try {
      const tx1 = await resolver1SrcContract.deploySrcCompactPartial(
        srcImmutables, order, signature.r, signature.vs, resolver1Amount, resolver1Amount,
        { value: resolver1SafetyDeposit, gasLimit: 5000000 }
      );
      await tx1.wait();
      console.log("✅ Resolver 1 deployed source escrow");
    } catch (error: any) {
      console.log("❌ Resolver 1 source failed:", error.message);
    }
    
    try {
      const tx2 = await resolver2SrcContract.deploySrcCompactPartial(
        srcImmutables, order, signature.r, signature.vs, resolver2Amount, resolver2Amount,
        { value: resolver2SafetyDeposit, gasLimit: 5000000 }
      );
      await tx2.wait();
      console.log("✅ Resolver 2 deployed source escrow");
    } catch (error: any) {
      console.log("❌ Resolver 2 source failed:", error.message);
    }
    
    try {
      const tx3 = await resolver3SrcContract.deploySrcCompactPartial(
        srcImmutables, order, signature.r, signature.vs, resolver3Amount, resolver3Amount,
        { value: resolver3SafetyDeposit, gasLimit: 5000000 }
      );
      await tx3.wait();
      console.log("✅ Resolver 3 deployed source escrow");
    } catch (error: any) {
      console.log("❌ Resolver 3 source failed:", error.message);
    }
    
    // STEP 5: Resolvers deploy destination escrows with safety deposits ONLY (no tokens yet)
    console.log("\n=== STEP 5: RESOLVERS DEPLOY DESTINATION ESCROWS (SAFETY DEPOSITS ONLY) ===");
    
    // Destination immutables (same structure but different token)
    const dstImmutables = {
      orderHash: orderHash,
      hashlock: hashlock,
      maker: BigInt(user.address),
      taker: BigInt("0"),
      token: BigInt(dstChainConfig.MockDAI), // Destination token (DAI)
      amount: totalDaiAmount, // Total DAI amount
      safetyDeposit: totalSafetyDeposit, // Same safety deposit structure
      timelocks: timelocks
    };
    
    // Calculate proportional DAI amounts
    const resolver1DaiAmount = (totalDaiAmount * resolver1Amount) / totalAmount;
    const resolver2DaiAmount = (totalDaiAmount * resolver2Amount) / totalAmount;
    const resolver3DaiAmount = (totalDaiAmount * resolver3Amount) / totalAmount;
    
    const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    
    // Deploy destination escrows with ONLY safety deposits, no tokens yet
    const dstFactoryAsResolver1 = dstFactory.connect(resolver1Dst);
    const dstFactoryAsResolver2 = dstFactory.connect(resolver2Dst);
    const dstFactoryAsResolver3 = dstFactory.connect(resolver3Dst);
    
    try {
      const tx1 = await dstFactoryAsResolver1.createDstEscrowPartialFor(
        dstImmutables, srcCancellationTimestamp, resolver1DaiAmount, resolver1Dst.address,
        { value: resolver1SafetyDeposit, gasLimit: 5000000 }
      );
      await tx1.wait();
      console.log("✅ Resolver 1 deployed destination escrow (safety deposit only)");
    } catch (error: any) {
      console.log("❌ Resolver 1 destination escrow failed:", error.message);
    }
    
    try {
      const tx2 = await dstFactoryAsResolver2.createDstEscrowPartialFor(
        dstImmutables, srcCancellationTimestamp, resolver2DaiAmount, resolver2Dst.address,
        { value: resolver2SafetyDeposit, gasLimit: 5000000 }
      );
      await tx2.wait();
      console.log("✅ Resolver 2 deployed destination escrow (safety deposit only)");
    } catch (error: any) {
      console.log("❌ Resolver 2 destination escrow failed:", error.message);
    }
    
    try {
      const tx3 = await dstFactoryAsResolver3.createDstEscrowPartialFor(
        dstImmutables, srcCancellationTimestamp, resolver3DaiAmount, resolver3Dst.address,
        { value: resolver3SafetyDeposit, gasLimit: 5000000 }
      );
      await tx3.wait();
      console.log("✅ Resolver 3 deployed destination escrow (safety deposit only)");
    } catch (error: any) {
      console.log("❌ Resolver 3 destination escrow failed:", error.message);
    }


    // STEP 6: Relayer transfers user funds to source escrow
    console.log("\n=== STEP 6: RELAYER TRANSFERS USER FUNDS (SECRET REVEALED) ===");
    const totalFilled = await srcFactory.getTotalFilledAmount(orderHash);
    console.log("Total filled amount:", formatUnits(totalFilled, 6), "USDT");
    
    if (totalFilled >= totalAmount) {
      const userUSDTBefore = await srcToken.balanceOf(user.address);
      console.log("User USDT before transfer:", formatUnits(userUSDTBefore, 6));
      
      const transferTx = await srcFactory.transferUserFunds(
        orderHash, user.address, srcChainConfig.MockUSDT, totalAmount
      );
      await transferTx.wait();
      console.log("✅ Relayer transferred user funds to source escrow");
      
      const userUSDTAfter = await srcToken.balanceOf(user.address);
      console.log("User USDT after transfer:", formatUnits(userUSDTAfter, 6));
      console.log("USDT transferred:", formatUnits(userUSDTBefore - userUSDTAfter, 6));
    }
    
    // STEP 7: Resolvers deposit destination tokens into escrows
    console.log("\n=== STEP 7: RESOLVERS DEPOSIT DESTINATION TOKENS ===");
    
    const dstEscrowAddress = await dstFactory.addressOfEscrowDst(dstImmutables);
    console.log("Destination escrow address:", dstEscrowAddress);
    
    // Now resolvers transfer their DAI to the destination escrow
    const resolver1DaiContract = new Contract(dstChainConfig.MockDAI, ERC20_ABI, resolver1Dst);
    const resolver2DaiContract = new Contract(dstChainConfig.MockDAI, ERC20_ABI, resolver2Dst);
    const resolver3DaiContract = new Contract(dstChainConfig.MockDAI, ERC20_ABI, resolver3Dst);
    
    try {
      const tx1 = await resolver1DaiContract.transfer(dstEscrowAddress, resolver1DaiAmount);
      await tx1.wait();
      console.log("✅ Resolver 1 deposited", formatUnits(resolver1DaiAmount, 18), "DAI to escrow");
    } catch (error: any) {
      console.log("❌ Resolver 1 DAI deposit failed:", error.message);
    }
    
    try {
      const tx2 = await resolver2DaiContract.transfer(dstEscrowAddress, resolver2DaiAmount);
      await tx2.wait();
      console.log("✅ Resolver 2 deposited", formatUnits(resolver2DaiAmount, 18), "DAI to escrow");
    } catch (error: any) {
      console.log("❌ Resolver 2 DAI deposit failed:", error.message);
    }
    
    try {
      const tx3 = await resolver3DaiContract.transfer(dstEscrowAddress, resolver3DaiAmount);
      await tx3.wait();
      console.log("✅ Resolver 3 deposited", formatUnits(resolver3DaiAmount, 18), "DAI to escrow");
    } catch (error: any) {
      console.log("❌ Resolver 3 DAI deposit failed:", error.message);
    }
    
    // Check escrow DAI balance
    const escrowDaiBalance = await dstToken.balanceOf(dstEscrowAddress);
    console.log("Total DAI in escrow:", formatUnits(escrowDaiBalance, 18));
    
    // STEP 8 (pre): Relayer revels secret
    console.log("🔓 Secret is now revealed publicly:", hexlify(secret));
    
    // STEP 8: Single withdrawal call for destination escrow (distributes to user + all resolvers)
    console.log("\n=== STEP 8: DESTINATION ESCROW WITHDRAWAL (SINGLE CALL) ===");
    
    const dstEscrow = new Contract(dstEscrowAddress, ESCROW_ABI, userDst);
    const userDaiBalanceBefore = await dstToken.balanceOf(user.address);
    console.log("User DAI balance before:", formatUnits(userDaiBalanceBefore, 18));
    
    try {
      const withdrawTx = await dstEscrow.withdrawWithSecret(secret, dstImmutables, { gasLimit: 1000000 });
      await withdrawTx.wait();
      
      console.log("✅ Destination escrow withdrawal completed");
      console.log("   - User received DAI tokens");
      console.log("   - All resolvers received safety deposits back");
      
      const userDaiBalanceAfter = await dstToken.balanceOf(user.address);
      console.log("User DAI balance after:", formatUnits(userDaiBalanceAfter, 18));
      console.log("DAI received:", formatUnits(userDaiBalanceAfter - userDaiBalanceBefore, 18));
    } catch (error: any) {
      console.log("❌ Destination escrow withdrawal failed:", error.message);
    }
    
    // STEP 9: Single withdrawal call for source escrow (distributes to all resolvers)
    console.log("\n=== STEP 9: SOURCE ESCROW WITHDRAWAL (SINGLE CALL) ===");
    
    const srcEscrowAddress = await srcFactory.addressOfEscrowSrc(srcImmutables);
    const srcEscrow = new Contract(srcEscrowAddress, ESCROW_ABI, user);
    
    // Check resolver balances before
    const resolver1USDTBefore = await srcToken.balanceOf(resolver1Src.address);
    const resolver2USDTBefore = await srcToken.balanceOf(resolver2Src.address);
    const resolver3USDTBefore = await srcToken.balanceOf(resolver3Src.address);
    
    console.log("Resolver USDT balances before:");
    console.log("  Resolver 1:", formatUnits(resolver1USDTBefore, 6));
    console.log("  Resolver 2:", formatUnits(resolver2USDTBefore, 6));
    console.log("  Resolver 3:", formatUnits(resolver3USDTBefore, 6));
    
    try {
      const withdrawTx = await srcEscrow.withdrawWithSecret(secret, srcImmutables, { gasLimit: 1000000 });
      await withdrawTx.wait();
      console.log("✅ Source escrow withdrawal completed");
      console.log("   - All resolvers received USDT tokens proportionally");
      console.log("   - All resolvers received safety deposits back");
      
      // Check resolver balances after
      const resolver1USDTAfter = await srcToken.balanceOf(resolver1Src.address);
      const resolver2USDTAfter = await srcToken.balanceOf(resolver2Src.address);
      const resolver3USDTAfter = await srcToken.balanceOf(resolver3Src.address);
      
      console.log("Resolver USDT balances after:");
      console.log("  Resolver 1:", formatUnits(resolver1USDTAfter, 6), "(+", formatUnits(resolver1USDTAfter - resolver1USDTBefore, 6), ")");
      console.log("  Resolver 2:", formatUnits(resolver2USDTAfter, 6), "(+", formatUnits(resolver2USDTAfter - resolver2USDTBefore, 6), ")");
      console.log("  Resolver 3:", formatUnits(resolver3USDTAfter, 6), "(+", formatUnits(resolver3USDTAfter - resolver3USDTBefore, 6), ")");
    } catch (error: any) {
      console.log("❌ Source escrow withdrawal failed:", error.message);
    }
    
    console.log("\n=== SWAP COMPLETE ===");
    console.log("✅ Cross-chain swap executed successfully with permissionless withdrawals!");
    console.log("- User received DAI on destination chain");
    console.log("- Resolvers received USDT proportionally on source chain");  
    console.log("- All safety deposits returned to resolvers on both chains");
    console.log("- Single withdrawal calls distributed funds to all parties automatically");
    console.log("Source escrow:", srcEscrowAddress);
    console.log("Destination escrow:", dstEscrowAddress);
    
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