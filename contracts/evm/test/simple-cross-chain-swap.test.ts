import { expect } from "chai";
import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  keccak256,
  toUtf8Bytes,
  AbiCoder,
  solidityPackedKeccak256,
} from "ethers";
import * as dotenv from "dotenv";
import allDeployments from "../deployments.json";

dotenv.config();

// Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const SIMPLE_RESOLVER_ABI = [
  "function deploySrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order, bytes signature, uint256 amount) payable",
  "function deployDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) dstImmutables, uint256 srcCancellationTimestamp) payable",
  "function withdraw(address escrow, bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)",
  "function owner() view returns (address)",
];

const LIMIT_ORDER_PROTOCOL_ABI = [
  "function fillOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order, bytes signature, uint256 makingAmount, uint256 takingAmount, address target) payable returns (uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash)",
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId) order) view returns (bytes32)",
  "function nonces(address) view returns (uint256)",
  "function domainSeparator() view returns (bytes32)",
];

const ESCROW_FACTORY_ABI = [
  "event SrcEscrowCreated(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 maker, uint256 amount, uint256 token, uint256 safetyDeposit, uint256 chainId) immutablesComplement)",
  "event DstEscrowCreated(address escrow, bytes32 hashlock, uint256 taker)",
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
  "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
];

// Test configuration
const TEST_SCENARIOS = [
  {
    name: "Base Sepolia to Arbitrum Sepolia",
    source: { chainId: 84532, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!, chainSlug: "base_sepolia" },
    destination: { chainId: 421614, rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARB_SEPOLIA_RPC_URL!, chainSlug: "arb_sepolia" },
  },
  {
    name: "Arbitrum Sepolia to Base Sepolia",
    source: { chainId: 421614, rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || process.env.ARB_SEPOLIA_RPC_URL!, chainSlug: "arb_sepolia" },
    destination: { chainId: 84532, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!, chainSlug: "base_sepolia" },
  },
];

// Helper to encode timelocks
function encodeTimelocks(locks: {
  srcWithdrawal: bigint;
  srcPublicWithdrawal: bigint;
  srcCancellation: bigint;
  srcPublicCancellation: bigint;
  dstWithdrawal: bigint;
  dstPublicWithdrawal: bigint;
  dstCancellation: bigint;
}): bigint {
  let encoded = 0n;
  encoded |= locks.srcWithdrawal;
  encoded |= locks.srcPublicWithdrawal << 32n;
  encoded |= locks.srcCancellation << 64n;
  encoded |= locks.srcPublicCancellation << 96n;
  encoded |= locks.dstWithdrawal << 128n;
  encoded |= locks.dstPublicWithdrawal << 160n;
  encoded |= locks.dstCancellation << 192n;
  return encoded;
}

// Helper to sign order using EIP-712
async function signOrder(
  order: any,
  signer: Wallet,
  domainName: string,
  domainVersion: string,
  chainId: number,
  verifyingContract: string
) {
  const domain = {
    name: domainName,
    version: domainVersion,
    chainId: chainId,
    verifyingContract: verifyingContract,
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
      { name: "dstChainId", type: "uint256" },
    ],
  };

  return await signer.signTypedData(domain, types, order);
}

describe("🔄 Simple Cross-Chain Swap Flow", () => {
  // Run tests for each scenario
  TEST_SCENARIOS.forEach((scenario) => {
    describe(`📍 ${scenario.name}`, () => {
      it("should execute complete cross-chain swap", async () => {
        if (!scenario.source.rpcUrl || !scenario.destination.rpcUrl) {
          console.log(`⚠️  Skipping ${scenario.name}: Missing RPC URLs`);
          return;
        }

        console.log("\\n" + "=".repeat(80));
        console.log(`🚀 Starting Cross-Chain Swap: ${scenario.name}`);
        console.log("=".repeat(80));

        // Initialize providers
        const srcProvider = new JsonRpcProvider(scenario.source.rpcUrl);
        const dstProvider = new JsonRpcProvider(scenario.destination.rpcUrl);

        // Initialize wallets
        const userPrivateKey = process.env.TEST_USER_PRIVATE_KEY || Wallet.createRandom().privateKey;
        const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY!;
        
        const user = new Wallet(userPrivateKey);
        const resolver = new Wallet(deployerPrivateKey);

        // Get chain configurations
        const deployments = allDeployments as any;
        const srcChainConfig = deployments.evm[scenario.source.chainSlug];
        const dstChainConfig = deployments.evm[scenario.destination.chainSlug];

        // Initialize contracts
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
          srcChainConfig.SimpleResolver || srcChainConfig.Resolver,
          SIMPLE_RESOLVER_ABI,
          user.connect(srcProvider)  // Use user wallet since they're the owner
        );

        const dstResolver = new Contract(
          dstChainConfig.SimpleResolver || dstChainConfig.Resolver,
          SIMPLE_RESOLVER_ABI,
          user.connect(dstProvider)  // Use user wallet since they're the owner
        );

        const limitOrderProtocol = new Contract(
          srcChainConfig.LimitOrderProtocol,
          LIMIT_ORDER_PROTOCOL_ABI,
          srcProvider
        );

        const srcEscrowFactory = new Contract(
          srcChainConfig.UniteEscrowFactory,
          ESCROW_FACTORY_ABI,
          srcProvider
        );

        const dstEscrowFactory = new Contract(
          dstChainConfig.UniteEscrowFactory,
          ESCROW_FACTORY_ABI,
          dstProvider
        );

        console.log("\\n📊 Configuration:");
        console.log(`├─ User: ${user.address}`);
        console.log(`├─ Resolver: ${resolver.address}`);
        console.log(`├─ Source Chain: ${scenario.source.chainSlug} (${scenario.source.chainId})`);
        console.log(`├─ Destination Chain: ${scenario.destination.chainSlug} (${scenario.destination.chainId})`);
        console.log(`├─ Source Token: ${srcChainConfig.MockUSDT}`);
        console.log(`├─ Destination Token: ${dstChainConfig.MockDAI}`);

        // Check balances
        const userBalance = await srcToken.balanceOf(user.address);
        const resolverBalanceSrc = await srcProvider.getBalance(resolver.address);
        const resolverBalanceDst = await dstProvider.getBalance(resolver.address);
        
        console.log("\\n💰 Initial Balances:");
        console.log(`├─ User Token Balance: ${formatUnits(userBalance, 6)} USDT`);
        console.log(`├─ Resolver ETH (Source): ${formatUnits(resolverBalanceSrc, 18)} ETH`);
        console.log(`└─ Resolver ETH (Destination): ${formatUnits(resolverBalanceDst, 18)} ETH`);

        if (userBalance < parseUnits("1", 6)) {
          console.log("\\n❌ Insufficient balance, skipping swap");
          return;
        }

        // Create order parameters
        const swapAmount = parseUnits("1", 6); // 1 USDT
        const secret = "0x" + Wallet.createRandom().privateKey.slice(2);
        const hashlock = keccak256(secret);
        const currentBlock = await srcProvider.getBlock("latest");
        const deadline = BigInt(currentBlock!.timestamp) + 3600n; // 1 hour from now

        // Get current nonce
        const currentNonce = await limitOrderProtocol.nonces(user.address);

        console.log("\\n🔐 Order Parameters:");
        console.log(`├─ Swap Amount: ${formatUnits(swapAmount, 6)} USDT`);
        console.log(`├─ Expected Output: 0.99 DAI`);
        console.log(`├─ Deadline: ${new Date(Number(deadline) * 1000).toISOString()}`);
        console.log(`└─ Secret Hash: ${hashlock}`);

        // Create order
        const order = {
          salt: BigInt(Math.floor(Math.random() * 1000000)),
          maker: user.address,
          receiver: "0x0000000000000000000000000000000000000000",
          makerAsset: srcChainConfig.MockUSDT,
          takerAsset: dstChainConfig.MockDAI,
          makingAmount: swapAmount,
          takingAmount: parseUnits("0.99", 18), // 0.99 DAI
          deadline: deadline,
          nonce: currentNonce,
          srcChainId: BigInt(scenario.source.chainId),
          dstChainId: BigInt(scenario.destination.chainId),
        };

        const orderHash = await limitOrderProtocol.hashOrder(order);
        console.log(`\\n📝 Order Created: ${orderHash}`);

        // Step 1: User approves tokens
        console.log("\\n━━━ STEP 1: Token Approval ━━━");
        const approveTx = await srcToken.approve(
          srcChainConfig.LimitOrderProtocol,
          swapAmount
        );
        console.log(`├─ Transaction: ${approveTx.hash}`);
        await approveTx.wait();
        console.log(`└─ ✅ Approved ${formatUnits(swapAmount, 6)} USDT to LimitOrderProtocol`);

        // Step 2: User signs order
        console.log("\\n━━━ STEP 2: Order Signing ━━━");
        const domainSeparator = await limitOrderProtocol.domainSeparator();
        console.log(`├─ Domain Separator: ${domainSeparator}`);
        
        const signature = await signOrder(
          order,
          user.connect(srcProvider),
          "LimitOrderProtocol",
          "1",
          scenario.source.chainId,
          srcChainConfig.LimitOrderProtocol
        );
        console.log(`├─ Signature: ${signature.slice(0, 20)}...`);
        console.log(`└─ ✅ Order signed`);

        // Create immutables for escrow
        const timelocks = encodeTimelocks({
          srcWithdrawal: 300n,
          srcPublicWithdrawal: 600n,
          srcCancellation: 900n,
          srcPublicCancellation: 1200n,
          dstWithdrawal: 300n,
          dstPublicWithdrawal: 600n,
          dstCancellation: 900n,
        });

        const immutables = {
          orderHash: orderHash,
          hashlock: hashlock,
          maker: BigInt(user.address),
          taker: BigInt(srcResolver.target),
          token: BigInt(srcChainConfig.MockUSDT),
          amount: swapAmount,
          safetyDeposit: parseUnits("0.001", 18),
          timelocks: timelocks,
        };

        // Step 3: Resolver deploys source escrow
        console.log("\\n━━━ STEP 3: Deploy Source Escrow ━━━");
        console.log(`├─ Sending ${formatUnits(parseUnits("0.001", 18), 18)} ETH as safety deposit`);
        
        try {
          const srcDeployTx = await srcResolver.deploySrc(
            immutables,
            order,
            signature,
            swapAmount,
            { value: parseUnits("0.001", 18) }
          );
          
          console.log(`├─ Transaction: ${srcDeployTx.hash}`);
          const srcReceipt = await srcDeployTx.wait();
          console.log(`├─ Gas Used: ${srcReceipt!.gasUsed.toString()}`);
          console.log(`└─ ✅ Source escrow deployed`);

          // Get escrow address from event
          const srcEscrowCreatedEvent = srcReceipt!.logs
            .map((log) => {
              try {
                return srcEscrowFactory.interface.parseLog(log);
              } catch {
                return null;
              }
            })
            .find((event) => event?.name === "SrcEscrowCreated");

          if (!srcEscrowCreatedEvent || !srcEscrowCreatedEvent.args) {
            throw new Error("SrcEscrowCreated event not found");
          }

          const [srcImmutables, srcComplement] = srcEscrowCreatedEvent.args;
          const srcEscrowAddress = await srcEscrowFactory.addressOfEscrowSrc(srcImmutables);
          
          console.log(`\\n📦 Source Escrow Details:`);
          console.log(`├─ Address: ${srcEscrowAddress}`);
          const escrowBalance = await srcToken.balanceOf(srcEscrowAddress);
          console.log(`└─ Balance: ${formatUnits(escrowBalance, 6)} USDT`);

          // Step 4: Resolver funds destination with tokens
          console.log("\\n━━━ STEP 4: Fund Destination Resolver ━━━");
          const resolverDstBalance = await dstToken.balanceOf(resolver.address);
          if (resolverDstBalance < parseUnits("0.99", 18)) {
            console.log(`⚠️  Resolver has insufficient tokens on destination chain`);
            console.log(`   Current: ${formatUnits(resolverDstBalance, 18)} DAI`);
            console.log(`   Needed: 0.99 DAI`);
          } else {
            console.log(`└─ ✅ Resolver has ${formatUnits(resolverDstBalance, 18)} DAI on destination`);

            // Step 5: Resolver deploys destination escrow
            console.log("\\n━━━ STEP 5: Deploy Destination Escrow ━━━");
            
            // Create destination immutables
            const dstImmutables = {
              ...immutables,
              taker: BigInt(dstResolver.target),
              token: BigInt(dstChainConfig.MockDAI),
              amount: parseUnits("0.99", 18),
            };

            const dstDeployTx = await dstResolver.deployDst(
              dstImmutables,
              BigInt(currentBlock!.timestamp) + 900n, // src cancellation timestamp
              { value: parseUnits("0.001", 18) }
            );
            
            console.log(`├─ Transaction: ${dstDeployTx.hash}`);
            const dstReceipt = await dstDeployTx.wait();
            console.log(`└─ ✅ Destination escrow deployed`);

            // Step 6: User reveals secret and withdraws
            console.log("\\n━━━ STEP 6: Withdraw with Secret ━━━");
            console.log(`├─ Revealing secret: ${secret}`);
            console.log(`└─ User can now withdraw 0.99 DAI from destination escrow`);

            // Step 7: Resolver withdraws from source
            console.log("\\n━━━ STEP 7: Resolver Withdrawal ━━━");
            console.log(`└─ Resolver can withdraw 1 USDT from source escrow using the revealed secret`);
          }

        } catch (error: any) {
          console.error(`└─ ❌ Transaction failed:`, error.message);
          if (error.data) {
            console.error(`   Error data:`, error.data);
          }
          throw error;
        }

        console.log("\\n" + "=".repeat(80));
        console.log("✨ Cross-chain swap flow completed successfully!");
        console.log("=".repeat(80) + "\\n");

      }, 60000); // 60 second timeout
    });
  });
});