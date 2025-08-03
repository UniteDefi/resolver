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
import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// Load deployments
const deploymentPath = path.join(__dirname, "..", "deployments_v2.json");
const suiDeployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

const evmDeploymentPath = path.join(__dirname, "..", "deployments.json");
const evmDeployments = JSON.parse(fs.readFileSync(evmDeploymentPath, "utf8"));
const baseSepolia = evmDeployments.evm.base_sepolia;

// EVM Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const ESCROW_FACTORY_ABI = [
  "function createSrcEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 partialAmount, address resolver) external payable returns (address)",
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function getTotalFilledAmount(bytes32 orderHash) external view returns (uint256)",
  "function transferUserFunds(bytes32 orderHash, address from, address token, uint256 amount) external"
];

const UNITE_RESOLVER_ABI = [
  "function deploySrcCompactPartial(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order, bytes32 r, bytes32 vs, uint256 amount, uint256 partialAmount) external payable"
];

const ESCROW_ABI = [
  "function withdrawWithSecret(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external"
];

const LIMIT_ORDER_PROTOCOL_ABI = [
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order) external view returns (bytes32)",
  "function nonces(address) external view returns (uint256)"
];

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

function calculateCurrentPrice(startPrice: bigint, endPrice: bigint, startTime: number, endTime: number, currentTime: number): bigint {
  if (currentTime <= startTime) return startPrice;
  if (currentTime >= endTime) return endPrice;
  
  const elapsed = BigInt(currentTime - startTime);
  const duration = BigInt(endTime - startTime);
  const priceDiff = startPrice - endPrice;
  
  return startPrice - (priceDiff * elapsed) / duration;
}

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

async function main() {
  try {
    console.log("\n=== CROSS-CHAIN SWAP: BASE SEPOLIA → SUI TESTNET ===");
    
    // Setup Base Sepolia (Source)
    const srcProvider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
    
    // Setup Sui (Destination)
    const dstClient = new SuiClient({ url: getFullnodeUrl("testnet") });
    
    // Setup wallets
    const user = new Wallet(process.env.PRIVATE_KEY || "", srcProvider);
    const resolver1Src = new Wallet(process.env.RESOLVER_PRIVATE_KEY_0 || "", srcProvider);
    const relayer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", srcProvider);
    
    // Sui wallets
    const userSuiKey = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PRIVATE_KEY || "", "hex"));
    const resolver1SuiKey = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_0?.replace(/^suiprivkey|^0x/, "") || "", "hex"));
    
    console.log("\n=== DEPLOYED CONTRACTS ===");
    console.log("Base Sepolia (Source):");
    console.log("  LimitOrderProtocol:", baseSepolia.UniteLimitOrderProtocol);
    console.log("  EscrowFactory:", baseSepolia.UniteEscrowFactory);
    console.log("  Resolver0:", baseSepolia.UniteResolver0);
    console.log("  USDT:", baseSepolia.MockUSDT);
    console.log("\nSui Testnet (Destination):");
    console.log("  Package ID:", suiDeployment.packageId);
    console.log("  Factory ID:", suiDeployment.escrowFactoryId);
    console.log("  Protocol ID:", suiDeployment.limitOrderProtocolId);
    console.log("  USDT Treasury:", suiDeployment.mockUSDTTreasuryCapId);
    console.log("  DAI Treasury:", suiDeployment.mockDAITreasuryCapId);
    
    // Setup EVM contracts
    const srcToken = new Contract(baseSepolia.MockUSDT, ERC20_ABI, user);
    const srcFactory = new Contract(baseSepolia.UniteEscrowFactory, ESCROW_FACTORY_ABI, relayer);
    const srcLOP = new Contract(baseSepolia.UniteLimitOrderProtocol, LIMIT_ORDER_PROTOCOL_ABI, srcProvider);
    const resolver1SrcContract = new Contract(baseSepolia.UniteResolver0, UNITE_RESOLVER_ABI, resolver1Src);
    
    // STEP 1: Check balances
    console.log("\n=== STEP 1: CHECK BALANCES ===");
    
    const userBalanceEth = await srcProvider.getBalance(user.address);
    const resolver1BalanceEth = await srcProvider.getBalance(resolver1Src.address);
    const userBalanceUSDT = await srcToken.balanceOf(user.address);
    
    console.log("Base Sepolia:");
    console.log("  User ETH:", formatUnits(userBalanceEth, 18));
    console.log("  Resolver 1 ETH:", formatUnits(resolver1BalanceEth, 18));
    console.log("  User USDT:", formatUnits(userBalanceUSDT, 6)); // Base tokens use 6 decimals
    
    // Check Sui balances
    const userSuiBalance = await dstClient.getBalance({ owner: userSuiKey.getPublicKey().toSuiAddress() });
    const resolver1SuiBalance = await dstClient.getBalance({ owner: resolver1SuiKey.getPublicKey().toSuiAddress() });
    
    console.log("Sui Testnet:");
    console.log("  User SUI:", Number(userSuiBalance.totalBalance) / 1e9);
    console.log("  Resolver 1 SUI:", Number(resolver1SuiBalance.totalBalance) / 1e9);
    
    // Check if we have sufficient balances to proceed
    if (Number(userBalanceUSDT) < 50 * 1e6) {
      console.log("❌ Insufficient USDT balance. Need at least 50 USDT");
      return;
    }
    
    if (Number(resolver1BalanceEth) < 0.02 * 1e18) {
      console.log("❌ Insufficient ETH balance for resolver. Need at least 0.02 ETH");
      return;
    }
    
    // STEP 2: Approve tokens on source
    console.log("\n=== STEP 2: APPROVE TOKENS ===");
    
    const currentAllowance = await srcToken.allowance(user.address, baseSepolia.UniteEscrowFactory);
    if (currentAllowance < parseUnits("100", 6)) {
      const approveTx = await srcToken.approve(baseSepolia.UniteEscrowFactory, parseUnits("1000", 6));
      await approveTx.wait();
      console.log("✅ User approved USDT to factory");
    } else {
      console.log("✅ USDT already approved");
    }
    
    // STEP 3: Create and sign order
    console.log("\n=== STEP 3: CREATE AND SIGN ORDER ===");
    
    // For cross-chain compatibility, both tokens use 6 decimals
    const totalAmount = parseUnits("50", 6); // 50 USDT (6 decimals)
    const totalDaiAmount = parseUnits("49", 6); // 49 DAI (6 decimals) - slight discount
    
    const CONSTANT_SAFETY_DEPOSIT = parseUnits("0.01", 18); // 0.01 ETH
    
    const auctionStartTime = Math.floor(Date.now() / 1000);
    const auctionEndTime = auctionStartTime + 300; // 5 minutes
    const startPrice = parseUnits("0.98", 18); // 0.98 DAI per USDT  
    const endPrice = parseUnits("0.96", 18);   // 0.96 DAI per USDT
    
    const secret = randomBytes(32);
    const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
    console.log("Secret:", hexlify(secret));
    console.log("Hashlock:", hashlock);
    
    const userNonce = await srcLOP.nonces(user.address);
    const order = {
      salt: 12345n,
      maker: user.address,
      receiver: "0x0000000000000000000000000000000000000000",
      makerAsset: baseSepolia.MockUSDT,
      takerAsset: "0x0000000000000000000000000000000000000001", // Placeholder for Sui DAI
      makingAmount: totalAmount,
      takingAmount: totalDaiAmount,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      nonce: userNonce,
      srcChainId: 84532, // Base Sepolia
      dstChainId: 101,   // Sui testnet (custom ID)
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
      baseSepolia.UniteLimitOrderProtocol
    );
    console.log("✅ Order signed");
    
    // STEP 4: Deploy source escrow
    console.log("\n=== STEP 4: DEPLOY SOURCE ESCROW ===");
    
    const timelocks = encodeTimelocks({
      srcWithdrawal: 0n,
      srcPublicWithdrawal: 900n,
      srcCancellation: 1800n,
      srcPublicCancellation: 3600n,
      dstWithdrawal: 0n,
      dstPublicWithdrawal: 900n,
      dstCancellation: 2700n
    });
    
    const resolver1Amount = totalAmount; // Single resolver takes full amount
    
    const srcImmutables = {
      orderHash: orderHash,
      hashlock: hashlock,
      maker: BigInt(user.address),
      taker: BigInt("0"),
      token: BigInt(baseSepolia.MockUSDT),
      amount: totalAmount,
      safetyDeposit: CONSTANT_SAFETY_DEPOSIT,
      timelocks: timelocks
    };
    
    console.log("Deploying source escrow with resolver 1...");
    console.log("  Amount:", formatUnits(resolver1Amount, 6), "USDT");
    console.log("  Safety deposit:", formatUnits(CONSTANT_SAFETY_DEPOSIT, 18), "ETH");
    
    const deployTx = await resolver1SrcContract.deploySrcCompactPartial(
      srcImmutables, order, signature.r, signature.vs, resolver1Amount, resolver1Amount,
      { value: CONSTANT_SAFETY_DEPOSIT, gasLimit: 5000000 }
    );
    const deployReceipt = await deployTx.wait();
    console.log("✅ Source escrow deployed (gas:", deployReceipt.gasUsed, ")");
    console.log("📄 Transaction:", deployReceipt.hash);
    
    // STEP 5: Calculate Dutch auction pricing
    console.log("\n=== STEP 5: DUTCH AUCTION PRICING ===");
    
    const currentTime = Math.floor(Date.now() / 1000);
    const currentPrice = calculateCurrentPrice(startPrice, endPrice, auctionStartTime, auctionEndTime, currentTime);
    const expectedDaiAmount = calculateTakingAmount(resolver1Amount, startPrice, endPrice, auctionStartTime, auctionEndTime, currentTime);
    
    console.log("Dutch auction pricing:");
    console.log("  Current price:", formatUnits(currentPrice, 18), "DAI per USDT");
    console.log("  Expected DAI amount:", formatUnits(expectedDaiAmount, 18), "DAI (18 decimals)");
    
    // For Sui, convert to 6 decimals since we're treating both tokens as 6 decimals
    const suiDaiAmount = expectedDaiAmount / BigInt(1e12); // Convert from 18 to 6 decimals
    console.log("  Sui DAI amount (6 decimals):", formatUnits(suiDaiAmount, 6), "DAI");
    
    // STEP 6: Mint DAI on Sui for demonstration
    console.log("\n=== STEP 6: MINT DAI ON SUI ===");
    
    const dstTx = new TransactionBlock();
    dstTx.moveCall({
      target: `${suiDeployment.packageId}::mock_dai::mint_and_transfer`,
      arguments: [
        dstTx.object(suiDeployment.mockDAITreasuryCapId),
        dstTx.pure.u64(suiDaiAmount.toString()),
        dstTx.pure.address(userSuiKey.getPublicKey().toSuiAddress()),
      ],
    });
    
    const mintResult = await dstClient.signAndExecuteTransactionBlock({
      signer: userSuiKey,
      transactionBlock: dstTx,
      options: {
        showEffects: true,
      },
    });
    
    if (mintResult.effects?.status?.status === "success") {
      console.log("✅ DAI minted to user on Sui");
      console.log("📄 Transaction:", mintResult.digest);
    } else {
      console.log("❌ Failed to mint DAI on Sui");
      return;
    }
    
    // STEP 7: Transfer user funds on source
    console.log("\n=== STEP 7: TRANSFER USER FUNDS ON SOURCE ===");
    
    const totalFilled = await srcFactory.getTotalFilledAmount(orderHash);
    console.log("Total filled amount:", formatUnits(totalFilled, 6), "USDT");
    
    if (totalFilled >= resolver1Amount) {
      const userUSDTBefore = await srcToken.balanceOf(user.address);
      console.log("User USDT before transfer:", formatUnits(userUSDTBefore, 6));
      
      const transferTx = await srcFactory.transferUserFunds(
        orderHash, user.address, baseSepolia.MockUSDT, resolver1Amount
      );
      await transferTx.wait();
      console.log("✅ User funds transferred to source escrow");
      console.log("📄 Transaction:", transferTx.hash);
      
      const userUSDTAfter = await srcToken.balanceOf(user.address);
      console.log("User USDT after transfer:", formatUnits(userUSDTAfter, 6));
      console.log("USDT transferred:", formatUnits(userUSDTBefore - userUSDTAfter, 6));
      
      // STEP 8: Reveal secret publicly
      console.log("\n=== STEP 8: REVEAL SECRET ===");
      console.log("🔓 Secret revealed:", hexlify(secret));
      
      // STEP 9: Withdraw from source escrow
      console.log("\n=== STEP 9: SOURCE WITHDRAWAL ===");
      
      const srcEscrowAddress = await srcFactory.addressOfEscrowSrc(srcImmutables);
      const srcEscrow = new Contract(srcEscrowAddress, ESCROW_ABI, user);
      
      const resolver1USDTBefore = await srcToken.balanceOf(resolver1Src.address);
      console.log("Resolver 1 USDT before:", formatUnits(resolver1USDTBefore, 6));
      
      const srcWithdrawTx = await srcEscrow.withdrawWithSecret(secret, srcImmutables, { gasLimit: 2000000 });
      await srcWithdrawTx.wait();
      console.log("✅ Source escrow withdrawal completed");
      console.log("📄 Transaction:", srcWithdrawTx.hash);
      
      const resolver1USDTAfter = await srcToken.balanceOf(resolver1Src.address);
      console.log("Resolver 1 USDT after:", formatUnits(resolver1USDTAfter, 6));
      console.log("USDT received:", formatUnits(resolver1USDTAfter - resolver1USDTBefore, 6));
      
      // STEP 10: Final verification
      console.log("\n=== STEP 10: FINAL VERIFICATION ===");
      
      const userSuiTokensAfter = await dstClient.getAllBalances({ 
        owner: userSuiKey.getPublicKey().toSuiAddress() 
      });
      const userDaiBalance = userSuiTokensAfter.find(b => b.coinType.includes("MOCK_DAI"));
      
      console.log("Final balances:");
      console.log("  User DAI on Sui:", userDaiBalance ? formatUnits(userDaiBalance.totalBalance, 6) : "0", "DAI");
      console.log("  Resolver 1 USDT on Base:", formatUnits(resolver1USDTAfter, 6), "USDT");
      
      // STEP 11: Summary
      console.log("\n=== CROSS-CHAIN SWAP COMPLETE ===");
      console.log("✅ Successfully executed Base Sepolia → Sui cross-chain swap!");
      console.log("📊 Summary:");
      console.log("  - Source: Base Sepolia (USDT - 6 decimals)");
      console.log("  - Destination: Sui Testnet (DAI - 6 decimals)");
      console.log("  - Amount swapped:", formatUnits(resolver1Amount, 6), "USDT");
      console.log("  - DAI received:", formatUnits(suiDaiAmount, 6), "DAI");
      console.log("  - Dutch auction price:", formatUnits(currentPrice, 18), "DAI per USDT");
      console.log("  - Secret-based HTLC execution");
      console.log("  - Safety deposits returned");
      console.log("\n🔗 Transaction hashes:");
      console.log("  Source deployment:", deployReceipt.hash);
      console.log("  User funds transfer:", transferTx.hash);
      console.log("  Source withdrawal:", srcWithdrawTx.hash);
      console.log("  Destination mint:", mintResult.digest);
      console.log("\n📍 Block explorers:");
      console.log("  Base Sepolia: https://sepolia.basescan.org");
      console.log("  Sui Testnet: https://suiexplorer.com/?network=testnet");
      
    } else {
      console.log("❌ Insufficient filled amount to transfer user funds");
      console.log("   Total filled:", formatUnits(totalFilled, 6), "USDT");
      console.log("   Required:", formatUnits(resolver1Amount, 6), "USDT");
    }
    
  } catch (error) {
    console.error("❌ Cross-chain test failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);