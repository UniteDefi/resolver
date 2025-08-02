import { expect } from "chai";
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
  AbiCoder,
  TypedDataDomain,
  TypedDataField
} from "ethers";
import * as ethers from "ethers";
import * as dotenv from "dotenv";
import allDeployments from "../deployments_main.json";

dotenv.config();

// Test configuration
const TEST_SCENARIOS = [
  {
    name: "Base Sepolia to Arbitrum Sepolia", 
    source: { chainId: 84532, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!, chainSlug: "base_sepolia" },
    destination: { chainId: 421614, rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL!, chainSlug: "arb_sepolia" },
  },
];

// Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function mint(address to, uint256 amount) returns (bool)"
];

const LIMIT_ORDER_PROTOCOL_ABI = [
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order) external view returns (bytes32)",
  "function domainSeparator() external view returns (bytes32)",
  "function nonces(address) external view returns (uint256)",
  "function fillOrderArgs(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits, bytes args) external payable returns (uint256 makingAmount, uint256 takingAmount, bytes32 orderHash)"
];

const ESCROW_FACTORY_ABI = [
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function createSrcEscrow(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external payable returns (address)",
  "function createDstEscrow(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp) external payable returns (address)",
  "event EscrowCreated(address indexed escrow, bytes32 indexed orderHash, bool isSource)"
];

const SIMPLE_RESOLVER_ABI = [
  "function deploySrcCompact(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order, bytes32 r, bytes32 vs, uint256 amount) external payable",
  "function deployDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp) external payable",
  "event SrcEscrowDeployed(address indexed escrow, bytes32 indexed orderHash)",
  "event DstEscrowDeployed(address indexed escrow, bytes32 indexed orderHash)"
];

const ESCROW_ABI = [
  "function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
  "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external"
];

// Helper functions
function encodeTimelocks(timelocks: Record<string, bigint>): bigint {
  let encoded = 0n;
  // Each timelock is 32 bits (4 bytes)
  encoded |= (timelocks.srcWithdrawal & 0xFFFFFFFFn);
  encoded |= (timelocks.srcPublicWithdrawal & 0xFFFFFFFFn) << 32n;
  encoded |= (timelocks.srcCancellation & 0xFFFFFFFFn) << 64n;
  encoded |= (timelocks.srcPublicCancellation & 0xFFFFFFFFn) << 96n;
  encoded |= (timelocks.dstWithdrawal & 0xFFFFFFFFn) << 128n;
  encoded |= (timelocks.dstPublicWithdrawal & 0xFFFFFFFFn) << 160n;
  encoded |= (timelocks.dstCancellation & 0xFFFFFFFFn) << 192n;
  // No dstPublicCancellation - only 7 stages
  // Deployment timestamp goes in bits 224-255 (will be set by contract)
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
      { name: "dstChainId", type: "uint256" }
    ]
  };

  const signature = await signer.signTypedData(domain, types, order);
  const sig = getBytes(signature);
  
  const r = hexlify(sig.slice(0, 32));
  const s = hexlify(sig.slice(32, 64));
  const v = sig[64];
  
  // Convert to compact format - same as Foundry test
  // vs = bytes32(uint256(v - 27) << 255 | uint256(s >> 1))
  const sBigInt = BigInt(s);
  const vBit = BigInt(v - 27);
  const vsBigInt = (vBit << 255n) | (sBigInt >> 1n);
  
  // Convert to 32-byte hex string
  const vs = "0x" + vsBigInt.toString(16).padStart(64, '0');
  
  return { r, vs };
}

describe("🔄 Simple Cross-Chain Swap Flow", () => {
  let user: Wallet;
  let resolver: Wallet;
  let deployments: any;

  beforeAll(async () => {
    deployments = allDeployments;
    
    // Setup wallets
    user = new Wallet(process.env.TEST_USER_PRIVATE_KEY!);
    resolver = new Wallet(process.env.DEPLOYER_PRIVATE_KEY!); // Using deployer as resolver
    
    console.log("\n👤 Test Setup:");
    console.log("├─ User:", user.address);
    console.log("└─ Resolver:", resolver.address);
  });

  TEST_SCENARIOS.forEach((scenario) => {
    describe(`📍 ${scenario.name}`, () => {
      it("should execute complete cross-chain swap with simple contracts", async () => {
        console.log("\n================================================================================");
        console.log(`🚀 Starting Cross-Chain Swap: ${scenario.name}`);
        console.log("================================================================================");

        // Setup providers
        const srcProvider = new JsonRpcProvider(scenario.source.rpcUrl);
        const dstProvider = new JsonRpcProvider(scenario.destination.rpcUrl);

        // Get chain configs
        const srcChainConfig = (deployments.evm as any)[scenario.source.chainSlug];
        const dstChainConfig = (deployments.evm as any)[scenario.destination.chainSlug];

        // Setup contracts - Using our new simple contracts
        const srcToken = new Contract(
          srcChainConfig.MockUSDT,
          ERC20_ABI,
          user.connect(srcProvider)
        );

        const dstToken = new Contract(
          dstChainConfig.MockDAI,
          ERC20_ABI,
          resolver.connect(dstProvider)
        );

        const srcResolver = new Contract(
          srcChainConfig.SimpleResolver,
          SIMPLE_RESOLVER_ABI,
          resolver.connect(srcProvider)
        );

        const dstResolver = new Contract(
          dstChainConfig.SimpleResolver,
          SIMPLE_RESOLVER_ABI,
          resolver.connect(dstProvider)
        );

        const limitOrderProtocol = new Contract(
          srcChainConfig.SimpleLimitOrderProtocol,
          LIMIT_ORDER_PROTOCOL_ABI,
          user.connect(srcProvider)
        );

        const srcEscrowFactory = new Contract(
          srcChainConfig.SimpleEscrowFactory,
          ESCROW_FACTORY_ABI,
          resolver.connect(srcProvider)
        );

        const dstEscrowFactory = new Contract(
          dstChainConfig.SimpleEscrowFactory,
          ESCROW_FACTORY_ABI,
          resolver.connect(dstProvider)
        );
        
        console.log("\n📋 Using Simple Contracts:");
        console.log("├─ LimitOrderProtocol (Base):", srcChainConfig.SimpleLimitOrderProtocol);
        console.log("├─ EscrowFactory (Base):", srcChainConfig.SimpleEscrowFactory);
        console.log("├─ Resolver (Base):", srcChainConfig.SimpleResolver);
        console.log("├─ LimitOrderProtocol (Arb):", dstChainConfig.SimpleLimitOrderProtocol);
        console.log("├─ EscrowFactory (Arb):", dstChainConfig.SimpleEscrowFactory);
        console.log("└─ Resolver (Arb):", dstChainConfig.SimpleResolver);

        // Get initial balances
        const userInitialBalance = await srcToken.balanceOf(user.address);
        const resolverInitialTokenBalance = await srcToken.balanceOf(resolver.address);
        const resolverSrcBalance = await srcProvider.getBalance(resolver.address);
        const resolverDstBalance = await dstProvider.getBalance(resolver.address);

        console.log("\n💰 Initial Balances:");
        console.log("├─ User Token Balance:", formatUnits(userInitialBalance, 6), "USDT");
        console.log("├─ Resolver Token Balance:", formatUnits(resolverInitialTokenBalance, 6), "USDT");
        console.log("├─ Resolver ETH (Source):", formatUnits(resolverSrcBalance, 18), "ETH");
        console.log("└─ Resolver ETH (Destination):", formatUnits(resolverDstBalance, 18), "ETH");

        // Swap parameters
        const swapAmount = parseUnits("1", 6); // 1 USDT
        const minReceiveAmount = parseUnits("0.99", 18); // 0.99 DAI minimum
        const safetyDepositSrc = parseUnits("0.001", 18); // 0.001 ETH
        const safetyDepositDst = parseUnits("0.001", 18); // 0.001 ETH

        // Create secret and hashlock
        const secret = randomBytes(32);
        const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);

        console.log("\n🔐 Order Parameters:");
        console.log("├─ Swap Amount:", formatUnits(swapAmount, 6), "USDT");
        console.log("├─ Min Receive Amount:", formatUnits(minReceiveAmount, 18), "DAI");
        console.log("└─ Secret Hash:", hexlify(hashlock));

        // Create order
        const currentNonce = await limitOrderProtocol.nonces(user.address);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

        const order = {
          salt: BigInt(Math.floor(Math.random() * 1000000)),
          maker: user.address,
          receiver: "0x0000000000000000000000000000000000000000",
          makerAsset: srcChainConfig.MockUSDT,
          takerAsset: dstChainConfig.MockDAI,
          makingAmount: swapAmount,
          takingAmount: minReceiveAmount,
          deadline: deadline,
          nonce: currentNonce,
          srcChainId: BigInt(scenario.source.chainId),
          dstChainId: BigInt(scenario.destination.chainId),
        };

        const orderHash = await limitOrderProtocol.hashOrder(order);
        console.log("\n📝 Order Created:", orderHash);

        // Step 1: User approves tokens
        console.log("\n━━━ STEP 1: Token Approval ━━━");
        const approveTx = await srcToken.approve(
          srcChainConfig.SimpleLimitOrderProtocol,
          swapAmount
        );
        console.log("├─ Transaction:", approveTx.hash);
        await approveTx.wait();
        console.log("└─ ✅ Approved", formatUnits(swapAmount, 6), "USDT to LimitOrderProtocol");

        // Step 2: User signs order
        console.log("\n━━━ STEP 2: Order Signing ━━━");
        const { r, vs } = await signOrder(
          order,
          user.connect(srcProvider),
          "LimitOrderProtocol",
          "1",
          scenario.source.chainId,
          srcChainConfig.SimpleLimitOrderProtocol
        );
        console.log("└─ ✅ Order signed (compact format)");

        // Create immutables for escrow - use 0 for immediate withdrawal in testing
        const timelocks = encodeTimelocks({
          srcWithdrawal: 0n,             // Immediate for testing
          srcPublicWithdrawal: 600n,     // 10 minutes
          srcCancellation: 900n,         // 15 minutes
          srcPublicCancellation: 1200n,  // 20 minutes
          dstWithdrawal: 0n,             // Immediate for testing
          dstPublicWithdrawal: 600n,     // 10 minutes
          dstCancellation: 900n          // 15 minutes
        });

        const srcImmutables = {
          orderHash: orderHash,
          hashlock: hashlock,
          maker: BigInt(user.address),
          taker: BigInt(resolver.address),
          token: BigInt(srcChainConfig.MockUSDT),
          amount: swapAmount,
          safetyDeposit: safetyDepositSrc,
          timelocks: timelocks
        };

        const dstImmutables = {
          orderHash: orderHash,
          hashlock: hashlock,
          maker: BigInt(user.address),
          taker: BigInt(resolver.address),
          token: BigInt(dstChainConfig.MockDAI),
          amount: minReceiveAmount,
          safetyDeposit: safetyDepositDst,
          timelocks: timelocks
        };

        // Step 3: Resolver deploys source escrow and fills order
        console.log("\n━━━ STEP 3: Deploy Source Escrow and Fill Order ━━━");
        console.log("├─ Sending", formatUnits(safetyDepositSrc, 18), "ETH as safety deposit");
        
        // Debug: Verify order hash matches
        const contractOrderHash = await limitOrderProtocol.hashOrder(order);
        
        // Deploy source escrow and fill order in one transaction
        const deploySrcTx = await srcResolver.deploySrcCompact(
          srcImmutables,
          order,
          r,
          vs,
          swapAmount,
          { value: safetyDepositSrc }
        );
        console.log("├─ Transaction:", deploySrcTx.hash);
        const deploySrcReceipt = await deploySrcTx.wait();
        
        // Find the escrow address from the event
        let srcEscrowAddress = "";
        for (const log of deploySrcReceipt.logs) {
          try {
            const parsedLog = srcResolver.interface.parseLog(log);
            if (parsedLog && parsedLog.name === "SrcEscrowDeployed") {
              srcEscrowAddress = parsedLog.args[0];
              break;
            }
          } catch {}
        }
        
        if (!srcEscrowAddress) {
          // Try factory events
          for (const log of deploySrcReceipt.logs) {
            try {
              const parsedLog = srcEscrowFactory.interface.parseLog(log);
              if (parsedLog && parsedLog.name === "EscrowCreated") {
                srcEscrowAddress = parsedLog.args[0];
                break;
              }
            } catch {}
          }
        }
        
        console.log("├─ Escrow Created at:", srcEscrowAddress);
        
        // Check escrow balance
        const escrowTokenBalance = await srcToken.balanceOf(srcEscrowAddress);
        console.log("├─ Escrow token balance:", formatUnits(escrowTokenBalance, 6), "USDT");
        
        console.log("└─ ✅ Source escrow deployed and funded");

        // Step 4: Resolver funds destination escrow with DAI
        console.log("\n━━━ STEP 4: Deploy Destination Escrow ━━━");
        
        // Approve DAI for resolver
        const dstApproveTx = await dstToken.approve(
          dstChainConfig.SimpleResolver,
          minReceiveAmount
        );
        console.log("├─ Approve DAI Tx:", dstApproveTx.hash);
        await dstApproveTx.wait();
        
        const deployDstTx = await dstResolver.deployDst(
          dstImmutables,
          BigInt(Math.floor(Date.now() / 1000) + 1800), // src cancellation timestamp (30 minutes)
          { value: safetyDepositDst }
        );
        console.log("├─ Transaction:", deployDstTx.hash);
        const deployDstReceipt = await deployDstTx.wait();
        
        // Find the DstEscrowDeployed event from resolver
        let dstEscrowAddress = "";
        for (const log of deployDstReceipt.logs) {
          try {
            const parsedLog = dstResolver.interface.parseLog(log);
            if (parsedLog && parsedLog.name === "DstEscrowDeployed") {
              dstEscrowAddress = parsedLog.args[0];
              break;
            }
          } catch {}
        }
        
        if (!dstEscrowAddress) {
          // Try to find from factory events
          for (const log of deployDstReceipt.logs) {
            try {
              const parsedLog = dstEscrowFactory.interface.parseLog(log);
              if (parsedLog && parsedLog.name === "EscrowCreated") {
                dstEscrowAddress = parsedLog.args[0];
                break;
              }
            } catch {}
          }
        }
        
        if (!dstEscrowAddress) {
          throw new Error("Failed to get destination escrow address");
        }
        console.log("├─ Escrow Created at:", dstEscrowAddress);
        console.log("└─ ✅ Destination escrow deployed and funded");

        // Step 5: User withdraws on destination
        console.log("\n━━━ STEP 5: User Withdraws on Destination ━━━");
        
        // Wait a bit for block time
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const dstEscrow = new Contract(dstEscrowAddress, ESCROW_ABI, user.connect(dstProvider));
        const withdrawDstTx = await dstEscrow.withdraw(secret, dstImmutables);
        console.log("├─ Transaction:", withdrawDstTx.hash);
        await withdrawDstTx.wait();
        
        const userDstBalance = await dstToken.balanceOf(user.address);
        console.log("└─ ✅ User received", formatUnits(userDstBalance, 18), "DAI");

        // Step 6: Resolver withdraws on source
        console.log("\n━━━ STEP 6: Resolver Withdraws on Source ━━━");
        
        const srcEscrow = new Contract(srcEscrowAddress, ESCROW_ABI, resolver.connect(srcProvider));
        const withdrawSrcTx = await srcEscrow.withdraw(secret, srcImmutables);
        console.log("├─ Transaction:", withdrawSrcTx.hash);
        await withdrawSrcTx.wait();
        
        const resolverFinalTokenBalance = await srcToken.balanceOf(resolver.address);
        const resolverTokenIncrease = resolverFinalTokenBalance - resolverInitialTokenBalance;
        console.log("└─ ✅ Resolver received", formatUnits(resolverTokenIncrease, 6), "USDT");

        // Verify final state
        console.log("\n📊 Final Verification:");
        expect(userDstBalance).to.be.gte(minReceiveAmount);
        expect(resolverTokenIncrease).to.equal(swapAmount);
        
        console.log("\n================================================================================");
        console.log("✨ Cross-chain swap completed successfully!");
        console.log("================================================================================\n");
      });
    });
  });
});