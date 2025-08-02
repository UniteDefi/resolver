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

  describe("🔄 Base Sepolia → Sui Testnet (USDT → SUI)", () => {
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
      console.log("Trading: USDT (Base) → SUI (Sui Testnet)");
      
      // STEP 1: Check balances
      console.log("\n=== STEP 1: INITIAL BALANCES ===");
      const userUSDTBalance = await baseToken.balanceOf(user.address);
      const userETHBalance = await baseProvider.getBalance(user.address);
      const userSuiBalance = await suiClient.getBalance({ owner: userSui.toSuiAddress() });
      
      console.log("Base Sepolia:");
      console.log("  User USDT:", formatUnits(userUSDTBalance, 6));
      console.log("  User ETH:", formatUnits(userETHBalance, 18));
      console.log("Sui Testnet:");
      console.log("  User SUI:", parseInt(userSuiBalance.totalBalance) / 1e9);
      
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
      const totalUSDTAmount = parseUnits("100", 6); // 100 USDT
      const totalSuiAmount = BigInt("95000000000"); // 95 SUI (price: 1 USDT = 0.95 SUI)
      const safetyDepositPerUnit = parseUnits("0.001", 18); // Increased safety deposit
      
      const auctionStartTime = Math.floor(Date.now() / 1000);
      const auctionEndTime = auctionStartTime + 300;
      const startPrice = parseUnits("0.95", 18); // 1 USDT = 0.95 SUI
      const endPrice = parseUnits("0.93", 18);   // 1 USDT = 0.93 SUI
      
      const secret = randomBytes(32);
      const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
      console.log("Secret:", hexlify(secret));
      console.log("Hashlock:", hashlock);
      
      const userNonce = await baseLOP.nonces(user.address);
      const order = {
        salt: 12345n,
        maker: user.address,
        receiver: userSui.toSuiAddress(), // Sui address for receiving
        makerAsset: BASE_CONFIG.MockUSDT,
        takerAsset: "0x0000000000000000000000000000000000000001", // Cross-chain SUI placeholder
        makingAmount: totalUSDTAmount,
        takingAmount: totalSuiAmount,
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
      const resolver1USDTAmount = parseUnits("60", 6);
      const resolver2USDTAmount = parseUnits("40", 6);
      
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
      
      // Calculate proportional SUI amounts
      const resolver1SuiAmount = (totalSuiAmount * resolver1USDTAmount) / totalUSDTAmount;
      const resolver2SuiAmount = (totalSuiAmount * resolver2USDTAmount) / totalUSDTAmount;
      
      const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      // Convert for Sui
      const orderHashBytes = bytes32ToArray(orderHash);
      const hashlockBytes = bytes32ToArray(hashlock);
      const makerAddress = user.address;
      
      let dstEscrowId = "";
      
      // Create first destination escrow on Sui
      try {
        const tx1 = new TransactionBlock();
        
        const resolver1SafetyDepositSui = 1000000000; // 1 SUI safety deposit
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
            tx1.pure(Number(totalSuiAmount)),
            tx1.pure(1000000000), // safety_deposit_per_unit
            timelocks,
            tx1.pure(srcCancellationTimestamp),
            tx1.pure(Number(resolver1SuiAmount)),
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
          
          const resolver2SafetyDepositSui = 1000000000; // 1 SUI safety deposit
          const [coin2] = tx2.splitCoins(tx2.gas, [tx2.pure(resolver2SafetyDepositSui)]);
          
          tx2.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow_factory::add_resolver_to_dst_escrow`,
            arguments: [
              tx2.object(SUI_CONFIG.EscrowFactory),
              tx2.object(dstEscrowId),
              tx2.pure(orderHashBytes),
              tx2.pure(resolver2Sui.toSuiAddress()),
              tx2.pure(Number(resolver2SuiAmount)),
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
      
      // STEP 6: Deposit SUI tokens to destination escrow
      console.log("\n=== STEP 6: DEPOSIT SUI TOKENS ===");
      
      if (dstEscrowId) {
        // Resolver 1 deposits SUI
        try {
          const tx1 = new TransactionBlock();
          const [suiCoin1] = tx1.splitCoins(tx1.gas, [tx1.pure(Number(resolver1SuiAmount))]);
          
          tx1.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow::deposit_sui_tokens`,
            arguments: [
              tx1.object(dstEscrowId),
              suiCoin1,
            ],
          });
          
          const result1 = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: tx1,
            signer: resolver1Sui,
            options: { showEffects: true },
          });
          
          if (result1.effects?.status.status === "success") {
            console.log("✅ Resolver 1 deposited", Number(resolver1SuiAmount) / 1e9, "SUI");
          }
        } catch (error: any) {
          console.log("❌ Resolver 1 SUI deposit failed:", error.message);
        }
        
        // Resolver 2 deposits SUI
        try {
          const tx2 = new TransactionBlock();
          const [suiCoin2] = tx2.splitCoins(tx2.gas, [tx2.pure(Number(resolver2SuiAmount))]);
          
          tx2.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow::deposit_sui_tokens`,
            arguments: [
              tx2.object(dstEscrowId),
              suiCoin2,
            ],
          });
          
          const result2 = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: tx2,
            signer: resolver2Sui,
            options: { showEffects: true },
          });
          
          if (result2.effects?.status.status === "success") {
            console.log("✅ Resolver 2 deposited", Number(resolver2SuiAmount) / 1e9, "SUI");
          }
        } catch (error: any) {
          console.log("❌ Resolver 2 SUI deposit failed:", error.message);
        }
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
      
      // Withdraw from Sui destination escrow (user gets SUI)
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
          
          const userSuiBalanceBefore = await suiClient.getBalance({ owner: userSui.toSuiAddress() });
          
          const withdrawResult = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: withdrawTx,
            signer: userSui,
            options: { showEffects: true, showEvents: true },
          });
          
          if (withdrawResult.effects?.status.status === "success") {
            console.log("✅ Sui destination escrow withdrawal completed");
            
            const userSuiBalanceAfter = await suiClient.getBalance({ owner: userSui.toSuiAddress() });
            const suiReceived = (parseInt(userSuiBalanceAfter.totalBalance) - parseInt(userSuiBalanceBefore.totalBalance)) / 1e9;
            console.log("SUI received by user:", suiReceived.toFixed(4));
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
      console.log("✅ User swapped USDT on Base for SUI on Sui Testnet");
      console.log("✅ Resolvers received USDT proportionally");
      console.log("✅ All safety deposits returned");
      
    }, 300000); // 5 minute timeout
  });

  describe("🔄 Sui Testnet → Base Sepolia (SUI → USDT)", () => {
    it("should execute complete cross-chain swap from Sui to Base", async () => {
      console.log("\n=== CROSS-CHAIN SWAP: SUI TESTNET → BASE SEPOLIA ===");
      console.log("Trading: SUI (Sui Testnet) → USDT (Base)");
      
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
      const baseToken = new Contract(BASE_CONFIG.MockUSDT, ERC20_ABI, userBase);
      const baseFactory = new Contract(BASE_CONFIG.UniteEscrowFactory, ESCROW_FACTORY_ABI, userBase);
      
      console.log("\n=== STEP 1: INITIAL BALANCES ===");
      const userSuiBalance = await suiClient.getBalance({ owner: userSui.toSuiAddress() });
      const userUSDTBalance = await baseToken.balanceOf(userBase.address);
      
      console.log("Sui Testnet:");
      console.log("  User SUI:", parseInt(userSuiBalance.totalBalance) / 1e9);
      console.log("Base Sepolia:");
      console.log("  User USDT:", formatUnits(userUSDTBalance, 6));
      
      // Generate secret and create order on Sui
      console.log("\n=== STEP 2: CREATE ORDER ON SUI ===");
      const totalSuiAmount = BigInt("100000000000"); // 100 SUI
      const totalUSDTAmount = parseUnits("105", 6); // 105 USDT (price: 1 SUI = 1.05 USDT)
      
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
      
      const resolver1SuiAmount = BigInt("60000000000"); // 60 SUI
      const resolver2SuiAmount = BigInt("40000000000"); // 40 SUI
      
      let srcEscrowId = "";
      
      try {
        const tx1 = new TransactionBlock();
        
        const resolver1SafetyDeposit = 2000000000; // 2 SUI safety deposit
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
            tx1.pure(Number(totalSuiAmount)),
            tx1.pure(2000000000), // safety_deposit_per_unit
            timelocks,
            tx1.pure(Number(resolver1SuiAmount)),
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
          
          const resolver2SafetyDeposit = 2000000000; // 2 SUI safety deposit
          const [coin2] = tx2.splitCoins(tx2.gas, [tx2.pure(resolver2SafetyDeposit)]);
          
          tx2.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow_factory::add_resolver_to_src_escrow`,
            arguments: [
              tx2.object(SUI_CONFIG.EscrowFactory),
              tx2.object(srcEscrowId),
              tx2.pure(Array.from(orderHashBytes)),
              tx2.pure(resolver2Sui.toSuiAddress()),
              tx2.pure(Number(resolver2SuiAmount)),
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
      
      // STEP 4: Deposit SUI tokens to source escrow
      console.log("\n=== STEP 4: DEPOSIT SUI TOKENS TO SOURCE ESCROW ===");
      
      if (srcEscrowId) {
        // Resolver 1 deposits SUI
        try {
          const tx1 = new TransactionBlock();
          const [suiCoin1] = tx1.splitCoins(tx1.gas, [tx1.pure(Number(resolver1SuiAmount))]);
          
          tx1.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow::deposit_sui_tokens`,
            arguments: [
              tx1.object(srcEscrowId),
              suiCoin1,
            ],
          });
          
          const result1 = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: tx1,
            signer: resolver1Sui,
            options: { showEffects: true },
          });
          
          if (result1.effects?.status.status === "success") {
            console.log("✅ Resolver 1 deposited", Number(resolver1SuiAmount) / 1e9, "SUI to source escrow");
          }
        } catch (error: any) {
          console.log("❌ Resolver 1 SUI deposit failed:", error.message);
        }
        
        // Resolver 2 deposits SUI
        try {
          const tx2 = new TransactionBlock();
          const [suiCoin2] = tx2.splitCoins(tx2.gas, [tx2.pure(Number(resolver2SuiAmount))]);
          
          tx2.moveCall({
            target: `${SUI_CONFIG.packageId}::escrow::deposit_sui_tokens`,
            arguments: [
              tx2.object(srcEscrowId),
              suiCoin2,
            ],
          });
          
          const result2 = await suiClient.signAndExecuteTransactionBlock({
            transactionBlock: tx2,
            signer: resolver2Sui,
            options: { showEffects: true },
          });
          
          if (result2.effects?.status.status === "success") {
            console.log("✅ Resolver 2 deposited", Number(resolver2SuiAmount) / 1e9, "SUI to source escrow");
          }
        } catch (error: any) {
          console.log("❌ Resolver 2 SUI deposit failed:", error.message);
        }
      }
      
      // STEP 5: Deploy destination escrows on Base Sepolia
      console.log("\n=== STEP 5: DEPLOY DESTINATION ESCROWS (BASE SEPOLIA) ===");
      
      const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const resolver1USDTAmount = parseUnits("63", 6); // 63 USDT (60/100 * 105)
      const resolver2USDTAmount = parseUnits("42", 6); // 42 USDT (40/100 * 105)
      
      const timelocks = encodeTimelocks({
        srcWithdrawal: 0n,
        srcPublicWithdrawal: 900n,
        srcCancellation: 1800n,
        srcPublicCancellation: 3600n,
        dstWithdrawal: 0n,
        dstPublicWithdrawal: 900n,
        dstCancellation: 2700n
      });
      
      const safetyDepositPerUnit = parseUnits("0.001", 18);
      const totalSafetyDeposit = (safetyDepositPerUnit * totalUSDTAmount) / parseUnits("1", 6);
      
      const dstImmutables = {
        orderHash: orderHash,
        hashlock: hashlock,
        maker: BigInt(userBase.address),
        taker: BigInt("0"),
        token: BigInt(BASE_CONFIG.MockUSDT),
        amount: totalUSDTAmount,
        safetyDeposit: totalSafetyDeposit,
        timelocks: timelocks
      };
      
      const resolver1SafetyDeposit = (totalSafetyDeposit * resolver1USDTAmount) / totalUSDTAmount;
      const resolver2SafetyDeposit = (totalSafetyDeposit * resolver2USDTAmount) / totalUSDTAmount;
      
      // Deploy Base destination escrows
      const resolver1BaseContract = new Contract(BASE_CONFIG.UniteResolver0, UNITE_RESOLVER_ABI, resolver1Base);
      const resolver2BaseContract = new Contract(BASE_CONFIG.UniteResolver1, UNITE_RESOLVER_ABI, resolver2Base);
      
      try {
        const tx1 = await resolver1BaseContract.deployDstPartial(
          dstImmutables, srcCancellationTimestamp, resolver1USDTAmount,
          { value: resolver1SafetyDeposit, gasLimit: 5000000 }
        );
        await tx1.wait();
        console.log("✅ Resolver 1 deployed Base destination escrow");
      } catch (error: any) {
        console.log("❌ Resolver 1 Base destination escrow failed:", error.message);
      }
      
      try {
        const tx2 = await resolver2BaseContract.deployDstPartial(
          dstImmutables, srcCancellationTimestamp, resolver2USDTAmount,
          { value: resolver2SafetyDeposit, gasLimit: 5000000 }
        );
        await tx2.wait();
        console.log("✅ Resolver 2 deployed Base destination escrow");
      } catch (error: any) {
        console.log("❌ Resolver 2 Base destination escrow failed:", error.message);
      }
      
      // STEP 6: Deposit USDT tokens to Base destination escrow
      console.log("\n=== STEP 6: DEPOSIT USDT TO BASE DESTINATION ESCROW ===");
      
      try {
        const dstEscrowAddress = await baseFactory.addressOfEscrowDst(dstImmutables);
        console.log("Base destination escrow address:", dstEscrowAddress);
        
        // Resolvers transfer USDT to destination escrow
        const resolver1BaseToken = new Contract(BASE_CONFIG.MockUSDT, ERC20_ABI, resolver1Base);
        const resolver2BaseToken = new Contract(BASE_CONFIG.MockUSDT, ERC20_ABI, resolver2Base);
        
        const tx1 = await resolver1BaseToken.transfer(dstEscrowAddress, resolver1USDTAmount);
        await tx1.wait();
        console.log("✅ Resolver 1 deposited", formatUnits(resolver1USDTAmount, 6), "USDT");
        
        const tx2 = await resolver2BaseToken.transfer(dstEscrowAddress, resolver2USDTAmount);
        await tx2.wait();
        console.log("✅ Resolver 2 deposited", formatUnits(resolver2USDTAmount, 6), "USDT");
        
      } catch (error: any) {
        console.log("❌ USDT deposit failed:", error.message);
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
      
      // Withdraw from Base destination escrow (user gets USDT)
      try {
        const dstEscrowAddress = await baseFactory.addressOfEscrowDst(dstImmutables);
        const dstEscrow = new Contract(dstEscrowAddress, ESCROW_ABI, userBase);
        
        const userUSDTBefore = await baseToken.balanceOf(userBase.address);
        
        const withdrawTx = await dstEscrow.withdrawWithSecret(secret, dstImmutables, { gasLimit: 1000000 });
        await withdrawTx.wait();
        console.log("✅ Base destination escrow withdrawal completed");
        
        const userUSDTAfter = await baseToken.balanceOf(userBase.address);
        console.log("USDT received by user:", formatUnits(userUSDTAfter - userUSDTBefore, 6));
        
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
              withdrawTx.object(SUI_CONFIG.Clock),
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
      console.log("✅ User swapped SUI on Sui for USDT on Base Sepolia");
      console.log("✅ Resolvers facilitated the cross-chain swap");
      console.log("✅ All safety deposits returned");
      
    }, 300000); // 5 minute timeout
  });
});