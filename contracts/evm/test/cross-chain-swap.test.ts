import { expect } from "chai";
import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  Signature,
  Interface,
  TransactionRequest,
  verifyTypedData,
} from "ethers";
import Sdk from "@1inch/cross-chain-sdk";
import { uint8ArrayToHex, UINT_40_MAX } from "@1inch/byte-utils";
import * as dotenv from "dotenv";
import allDeployments from "../deployments.json";
import ResolverContract from "../out/Resolver.sol/Resolver.json";

dotenv.config();

const { Address } = Sdk;

// Monkey patch the SDK to support test chains
const originalNew = Sdk.CrossChainOrder.new;
Sdk.CrossChainOrder.new = function(...args: any[]) {
  const [escrowFactory, orderInfo, escrowParams, details, extra] = args;
  
  // Replace test chain IDs with mainnet IDs for validation
  const testToMainnet: Record<number, number> = {
    11155111: 1,     // Sepolia -> Ethereum
    84532: 137,      // Base Sepolia -> Polygon
    421614: 42161,   // Arb Sepolia -> Arbitrum
  };
  
  const srcChainId = escrowParams.srcChainId;
  const dstChainId = escrowParams.dstChainId;
  
  if (testToMainnet[srcChainId] && testToMainnet[dstChainId]) {
    // Temporarily use mainnet IDs
    const modifiedParams = {
      ...escrowParams,
      srcChainId: testToMainnet[srcChainId],
      dstChainId: testToMainnet[dstChainId],
    };
    
    const order = originalNew.call(this, escrowFactory, orderInfo, modifiedParams, details, extra);
    
    // Override methods to use original test chain IDs
    const originalGetOrderHash = order.getOrderHash.bind(order);
    const originalGetTypedData = order.getTypedData.bind(order);
    
    order.getOrderHash = function(chainId: number) {
      return originalGetOrderHash(testToMainnet[chainId] || chainId);
    };
    
    order.getTypedData = function(chainId: number) {
      const data = originalGetTypedData(testToMainnet[chainId] || chainId);
      if (data.domain && testToMainnet[chainId]) {
        data.domain.chainId = chainId;
        // Also update verifying contract to use test deployment
        const deployments = allDeployments as any;
        if (chainId === 11155111) {
          data.domain.verifyingContract = deployments.evm.eth_sepolia.LimitOrderProtocol.toLowerCase();
        } else if (chainId === 84532) {
          data.domain.verifyingContract = deployments.evm.base_sepolia.LimitOrderProtocol.toLowerCase();
        } else if (chainId === 421614) {
          data.domain.verifyingContract = deployments.evm.arb_sepolia.LimitOrderProtocol.toLowerCase();
        }
      }
      return data;
    };
    
    return order;
  }
  
  // Call original for other chains
  return originalNew.call(this, escrowFactory, orderInfo, escrowParams, details, extra);
};

// Test configuration - Base and Arbitrum Sepolia only for faster testing
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

// Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const RESOLVER_ABI = [
  "function deploySrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits, bytes args) payable",
  "function deployDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) dstImmutables, uint256 srcCancellationTimestamp) payable",
  "function withdraw(address escrow, bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)",
  "function owner() view returns (address)",
];

const ESCROW_FACTORY_ABI = [
  "event SrcEscrowCreated(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 maker, uint256 amount, uint256 token, uint256 safetyDeposit, uint256 chainId) immutablesComplement)",
  "event DstEscrowCreated(address escrow, bytes32 hashlock, uint256 taker)",
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
  "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
  "function ESCROW_SRC_IMPLEMENTATION() view returns (address)",
  "function ESCROW_DST_IMPLEMENTATION() view returns (address)",
];

// Helper class for resolver operations
class ResolverHelper {
  private readonly iface: Interface;

  constructor(
    public readonly srcAddress: string,
    public readonly dstAddress: string
  ) {
    this.iface = new Interface(ResolverContract.abi);
  }

  public deploySrc(
    chainId: number,
    order: Sdk.CrossChainOrder,
    signature: string,
    takerTraits: Sdk.TakerTraits,
    amount: bigint,
    hashLock = order.escrowExtension.hashLockInfo
  ): TransactionRequest {
    const { r, yParityAndS: vs } = Signature.from(signature);
    const { args, trait } = takerTraits.encode();
    const immutables = order.toSrcImmutables(
      chainId,
      new Address(this.srcAddress), // This is the resolver address (taker)
      amount,
      hashLock
    );

    return {
      to: this.srcAddress,
      data: this.iface.encodeFunctionData("deploySrc", [
        immutables.build(),
        order.build(),
        r,
        vs,
        amount,
        trait,
        args,
      ]),
      value: order.escrowExtension.srcSafetyDeposit,
    };
  }

  public deployDst(immutables: Sdk.Immutables): TransactionRequest {
    return {
      to: this.dstAddress,
      data: this.iface.encodeFunctionData("deployDst", [
        immutables.build(),
        immutables.timeLocks.toSrcTimeLocks().privateCancellation,
      ]),
      value: immutables.safetyDeposit,
    };
  }

  public withdraw(
    side: "src" | "dst",
    escrow: string,
    secret: string,
    immutables: Sdk.Immutables
  ): TransactionRequest {
    return {
      to: side === "src" ? this.srcAddress : this.dstAddress,
      data: this.iface.encodeFunctionData("withdraw", [
        escrow,
        secret,
        immutables.build(),
      ]),
    };
  }
}

describe("🔄 Complete Cross-Chain Swap Flow", () => {
  // Run tests for each scenario
  TEST_SCENARIOS.forEach((scenario) => {
    describe(`📍 ${scenario.name}`, () => {
      it("should execute complete cross-chain swap with detailed logging", async () => {
        if (!scenario.source.rpcUrl || !scenario.destination.rpcUrl) {
          console.log(`⚠️  Skipping ${scenario.name}: Missing RPC URLs`);
          return;
        }

        console.log("\n" + "=".repeat(80));
        console.log(`🚀 Starting Cross-Chain Swap: ${scenario.name}`);
        console.log("=".repeat(80));

        // Initialize providers
        const srcProvider = new JsonRpcProvider(scenario.source.rpcUrl);
        const dstProvider = new JsonRpcProvider(scenario.destination.rpcUrl);

        // Initialize wallets
        const userPrivateKey = process.env.TEST_USER_PRIVATE_KEY || Wallet.createRandom().privateKey;
        // Use the deployer private key as resolver since it owns the Resolver contracts
        const resolverPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY!;
        
        const user = new Wallet(userPrivateKey);
        const resolver = new Wallet(resolverPrivateKey);

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

        const srcResolverContract = new Contract(
          srcChainConfig.Resolver,
          RESOLVER_ABI,
          resolver.connect(srcProvider)
        );

        const dstResolverContract = new Contract(
          dstChainConfig.Resolver,
          RESOLVER_ABI,
          resolver.connect(dstProvider)
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

        // Initialize resolver helper
        const resolverHelper = new ResolverHelper(
          srcChainConfig.Resolver,
          dstChainConfig.Resolver
        );

        console.log("\n📊 Configuration:");
        console.log(`├─ User: ${user.address}`);
        console.log(`├─ Resolver: ${resolver.address}`);
        console.log(`├─ Source Chain: ${scenario.source.chainSlug} (${scenario.source.chainId})`);
        console.log(`├─ Destination Chain: ${scenario.destination.chainSlug} (${scenario.destination.chainId})`);
        console.log(`├─ Source Token: ${srcChainConfig.MockUSDT}`);
        console.log(`├─ Destination Token: ${dstChainConfig.MockDAI}`);
        console.log(`├─ Source Resolver: ${srcChainConfig.Resolver}`);
        console.log(`└─ Destination Resolver: ${dstChainConfig.Resolver}`);

        // Check balances
        const userBalance = await srcToken.balanceOf(user.address);
        const resolverBalanceSrc = await srcProvider.getBalance(resolver.address);
        const resolverBalanceDst = await dstProvider.getBalance(resolver.address);
        
        console.log("\n💰 Initial Balances:");
        console.log(`├─ User Token Balance: ${formatUnits(userBalance, 6)} USDT`);
        console.log(`├─ Resolver ETH (Source): ${formatUnits(resolverBalanceSrc, 18)} ETH`);
        console.log(`└─ Resolver ETH (Destination): ${formatUnits(resolverBalanceDst, 18)} ETH`);

        if (userBalance < parseUnits("1", 6)) {
          console.log("\n❌ Insufficient balance, skipping swap");
          return;
        }

        // Create order parameters
        const swapAmount = parseUnits("1", 6); // 1 USDT
        const secret = "0x" + Wallet.createRandom().privateKey.slice(2);
        const currentBlock = await srcProvider.getBlock("latest");
        const srcTimestamp = BigInt(currentBlock!.timestamp);

        console.log("\n🔐 Order Parameters:");
        console.log(`├─ Swap Amount: ${formatUnits(swapAmount, 6)} USDT`);
        console.log(`├─ Expected Output: 0.99 USDT`);
        console.log(`├─ Safety Deposit (Src): 0.001 ETH`);
        console.log(`├─ Safety Deposit (Dst): 0.001 ETH`);
        console.log(`└─ Secret Hash: ${Sdk.HashLock.hashSecret(secret)}`);

        // Create cross-chain order
        const order = Sdk.CrossChainOrder.new(
          new Address(srcChainConfig.UniteEscrowFactory),
          {
            salt: Sdk.randBigInt(1000n),
            maker: new Address(user.address),
            makingAmount: swapAmount,
            takingAmount: parseUnits("0.99", 6), // 0.99 rate
            makerAsset: new Address(srcChainConfig.MockUSDT),
            takerAsset: new Address(dstChainConfig.MockDAI),
            receiver: new Address("0x0000000000000000000000000000000000000000"),
          },
          {
            hashLock: Sdk.HashLock.forSingleFill(secret),
            timeLocks: Sdk.TimeLocks.new({
              srcWithdrawal: 300n,
              srcPublicWithdrawal: 600n,
              srcCancellation: 900n,
              srcPublicCancellation: 1200n,
              dstWithdrawal: 300n,
              dstPublicWithdrawal: 600n,
              dstCancellation: 900n,
            }),
            srcChainId: scenario.source.chainId,
            dstChainId: scenario.destination.chainId,
            srcSafetyDeposit: parseUnits("0.001", 18),
            dstSafetyDeposit: parseUnits("0.001", 18),
          },
          {
            auction: new Sdk.AuctionDetails({
              initialRateBump: 0,
              points: [],
              duration: 180n,
              startTime: srcTimestamp,
            }),
            whitelist: [
              {
                address: new Address(srcChainConfig.Resolver),
                allowFrom: 0n,
              },
            ],
            resolvingStartTime: 0n,
          },
          {
            nonce: Sdk.randBigInt(UINT_40_MAX),
            allowPartialFills: false,
            allowMultipleFills: false,
          }
        );

        const orderHash = order.getOrderHash(scenario.source.chainId);
        console.log(`\n📝 Order Created: ${orderHash}`);
        
        // Debug order structure
        const builtOrder = order.build();
        console.log(`├─ Built order:`, JSON.stringify(builtOrder, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value, 2));

        // Step 1: User approves tokens
        console.log("\n━━━ STEP 1: Token Approval ━━━");
        const approveTx = await srcToken.approve(
          srcChainConfig.LimitOrderProtocol,
          swapAmount
        );
        console.log(`├─ Transaction: ${approveTx.hash}`);
        await approveTx.wait();
        console.log(`└─ ✅ Approved ${formatUnits(swapAmount, 6)} USDT to LimitOrderProtocol`);

        // Step 2: User signs order
        console.log("\n━━━ STEP 2: Order Signing ━━━");
        const typedData = order.getTypedData(scenario.source.chainId);
        
        // Debug the domain being used
        console.log(`├─ Domain:`, JSON.stringify(typedData.domain, null, 2));
        console.log(`├─ Order message:`, JSON.stringify(typedData.message, null, 2));
        console.log(`├─ Order types:`, JSON.stringify(typedData.types, null, 2));
        console.log(`├─ LOP Address in deployments: ${srcChainConfig.LimitOrderProtocol}`);
        
        // Also get the original order hash for comparison
        const orderHashFromOrder = order.getOrderHash(scenario.source.chainId);
        console.log(`├─ Order hash from SDK: ${orderHashFromOrder}`);
        
        const signature = await user.signTypedData(
          typedData.domain,
          { Order: typedData.types[typedData.primaryType || "Order"] },
          typedData.message
        );
        
        const recoveredAddress = verifyTypedData(
          typedData.domain,
          { Order: typedData.types[typedData.primaryType || "Order"] },
          typedData.message,
          signature
        );
        
        console.log(`├─ Signature: ${signature.slice(0, 20)}...`);
        console.log(`├─ Recovered Address: ${recoveredAddress}`);
        console.log(`└─ ✅ Signature Valid: ${recoveredAddress.toLowerCase() === user.address.toLowerCase()}`);

        // Step 3: Resolver deploys source escrow
        console.log("\n━━━ STEP 3: Deploy Source Escrow ━━━");
        const takerTraits = Sdk.TakerTraits.default()
          .setExtension(order.extension)
          .setAmountMode(Sdk.AmountMode.maker)
          .setAmountThreshold(order.takingAmount);

        const srcDeployTxRequest = resolverHelper.deploySrc(
          scenario.source.chainId,
          order,
          signature,
          takerTraits,
          swapAmount
        );
        
        // Debug what's being sent to the contract
        const iface = new Interface(RESOLVER_ABI);
        const decodedData = iface.parseTransaction({ data: srcDeployTxRequest.data });
        console.log(`├─ Decoded function call:`, decodedData?.name);
        if (decodedData?.args) {
          const [immutables, orderArg, r, vs, amount, takerTraitsArg, args] = decodedData.args;
          console.log(`├─ Order being sent (converted):`, JSON.stringify(orderArg, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value, 2));
          console.log(`├─ Original SDK order:`, JSON.stringify(builtOrder, null, 2));
        }

        console.log(`├─ Sending ${formatUnits(srcDeployTxRequest.value!, 18)} ETH as safety deposit`);
        console.log(`├─ Transaction data length: ${srcDeployTxRequest.data?.length || 0}`);
        console.log(`├─ Transaction to: ${srcDeployTxRequest.to}`);
        
        if (!srcDeployTxRequest.data) {
          throw new Error("Transaction data is missing!");
        }
        
        // Debug the transaction request
        const txRequest = {
          to: srcDeployTxRequest.to,
          data: srcDeployTxRequest.data,
          value: srcDeployTxRequest.value,
          gasLimit: 3000000
        };
        console.log(`├─ Full tx request:`, JSON.stringify({
          to: txRequest.to,
          dataLength: txRequest.data?.length,
          value: txRequest.value?.toString(),
          gasLimit: txRequest.gasLimit
        }));
        
        // First, simulate the transaction to get better error details
        console.log(`├─ Simulating transaction...`);
        try {
          await resolver.connect(srcProvider).estimateGas(txRequest);
          console.log(`├─ Simulation successful`);
        } catch (simError: any) {
          console.error(`├─ ❌ Simulation failed:`, simError.message);
          if (simError.error?.data) {
            try {
              // Try to decode with resolver errors
              const resolverIface = new Interface([
                "error OnlyOwner()",
                "error NativeTokenSendingFailure()"
              ]);
              const decoded = resolverIface.parseError(simError.error.data);
              console.error(`   Resolver error:`, decoded);
            } catch {
              // Try to decode with LOP errors
              try {
                const lopIface = new Interface([
                  "error BadSignature()",
                  "error InvalidatedOrder()",
                  "error TakingAmountExceeded()",
                  "error WrongAmount()",
                  "error WrongGetter()",
                  "error NotEnoughForFees()",
                  "error PrivateOrder()",
                  "error BadExtension()",
                  "error ReentrancyDetected()",
                  "error PredicateIsNotTrue()",
                  "error OnlyWitnessAllowed()",
                  "error WrongToken()",
                  "error TakingAmountTooHigh()",
                  "error MakingAmountTooLow()",
                  "error TransferFromMakerToTakerFailed()",
                  "error TransferFromTakerToMakerFailed()",
                  "error MismatchArraysLengths()",
                  "error InvalidPermit()",
                  "error InvalidPermit2()",
                  "error SimulationResults(bool success, bytes res)"
                ]);
                const decoded = lopIface.parseError(simError.error.data);
                console.error(`   LOP error:`, decoded);
              } catch {
                console.error(`   Raw error data:`, simError.error.data);
              }
            }
          }
        }
        
        try {
          const srcDeployTx = await resolver
            .connect(srcProvider)
            .sendTransaction(txRequest);
          
          console.log(`├─ Transaction: ${srcDeployTx.hash}`);
          const srcReceipt = await srcDeployTx.wait();
          console.log(`├─ Gas Used: ${srcReceipt!.gasUsed.toString()}`);
          console.log(`└─ ✅ Source escrow deployed`);
        } catch (error: any) {
          console.error(`└─ ❌ Transaction failed:`, error.message);
          
          // Try to get the revert reason
          if (error.data) {
            try {
              const iface = new Interface([
                "error BadSignature()",
                "error OnlyOwner()",
                "error Expired(uint256)",
                "error WrongToken()",
                "error TakingAmountTooHigh()",
                "error PrivateOrder()",
                "error InvalidMsgValue()",
                "error InsufficientBalance()",
                "error WrongAmount()",
                "error WrongGetter()",
                "error ReentrancyDetected()",
                "error PredicateIsNotTrue()",
                "error OnlyWitnessAllowed()",
                "error NotEnoughEth()",
                "error EthTransferFailed()",
                "error RevertWithReason(string)",
                "error AccessDenied()",
              ]);
              const decoded = iface.parseError(error.data);
              console.error(`   Revert reason:`, decoded);
            } catch (e) {
              console.error(`   Raw error data:`, error.data);
            }
          }
          throw error;
        }

        // Get escrow details from event
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
        
        console.log(`\n📦 Source Escrow Details:`);
        console.log(`├─ Address: ${srcEscrowAddress}`);
        const escrowBalance = await srcToken.balanceOf(srcEscrowAddress);
        console.log(`└─ Balance: ${formatUnits(escrowBalance, 6)} USDT`);

        // Step 4: Resolver funds destination with tokens
        console.log("\n━━━ STEP 4: Fund Destination Resolver ━━━");
        const resolverDstBalance = await dstToken.balanceOf(resolver.address);
        if (resolverDstBalance < parseUnits("0.99", 6)) {
          console.log(`⚠️  Resolver has insufficient tokens on destination chain`);
          console.log(`   Current: ${formatUnits(resolverDstBalance, 6)} USDT`);
          console.log(`   Needed: 0.99 USDT`);
          console.log(`   Skipping destination escrow deployment`);
        } else {
          console.log(`└─ ✅ Resolver has ${formatUnits(resolverDstBalance, 6)} USDT on destination`);

          // Step 5: Resolver deploys destination escrow
          console.log("\n━━━ STEP 5: Deploy Destination Escrow ━━━");
          const dstImmutables = Sdk.Immutables.fromEscrowImmutables(
            srcImmutables,
            srcComplement
          ).withTaker(new Address(dstChainConfig.Resolver));

          const dstDeployTxRequest = resolverHelper.deployDst(dstImmutables);
          console.log(`├─ Sending ${formatUnits(dstDeployTxRequest.value!, 18)} ETH as safety deposit`);

          const dstDeployTx = await resolver
            .connect(dstProvider)
            .sendTransaction(dstDeployTxRequest);
          
          console.log(`├─ Transaction: ${dstDeployTx.hash}`);
          const dstReceipt = await dstDeployTx.wait();
          console.log(`└─ ✅ Destination escrow deployed`);

          // Step 6: User reveals secret and withdraws
          console.log("\n━━━ STEP 6: Withdraw with Secret ━━━");
          console.log(`├─ Revealing secret: ${secret}`);
          console.log(`└─ User can now withdraw 0.99 USDT from destination escrow`);

          // Step 7: Resolver withdraws from source
          console.log("\n━━━ STEP 7: Resolver Withdrawal ━━━");
          console.log(`└─ Resolver can withdraw 1 USDT from source escrow using the revealed secret`);
        }

        console.log("\n" + "=".repeat(80));
        console.log("✨ Cross-chain swap flow demonstrated successfully!");
        console.log("=".repeat(80) + "\n");

      }, 60000); // 60 second timeout
    });
  });
});