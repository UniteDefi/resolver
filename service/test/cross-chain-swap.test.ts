import { expect } from "chai";
import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  Signature,
} from "ethers";
import Sdk from "@1inch/cross-chain-sdk";
import { uint8ArrayToHex, UINT_40_MAX } from "@1inch/byte-utils";
import * as dotenv from "dotenv";
import allDeployments from "../../deployments.json";

dotenv.config();

const { Address } = Sdk;

// Test configuration
const TEST_CHAINS = {
  source: {
    chainId: 11155111, // Ethereum Sepolia
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL!,
  },
  destination: {
    chainId: 84532, // Base Sepolia
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!,
  },
};

// Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const RESOLVER_ABI = [
  "function deploySrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, uint256 maker, uint256 receiver, uint256 makerAsset, uint256 takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits, bytes args) payable",
  "function deployDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) dstImmutables, uint256 srcCancellationTimestamp) payable",
  "function withdraw(address escrow, bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)",
];

const ESCROW_FACTORY_ABI = [
  "event SrcEscrowCreated(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 maker, uint256 amount, uint256 token, uint256 safetyDeposit, uint256 chainId) immutablesComplement)",
  "event DstEscrowCreated(address escrow, bytes32 hashlock, uint256 taker)",
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
  "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
  "function ESCROW_SRC_IMPLEMENTATION() view returns (address)",
  "function ESCROW_DST_IMPLEMENTATION() view returns (address)",
];

const ESCROW_ABI = [
  "function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)",
  "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)",
];

describe("Cross-Chain Swap with SDK", function () {
  this.timeout(60000); // 1 minute timeout for tests

  let srcProvider: JsonRpcProvider;
  let dstProvider: JsonRpcProvider;
  let user: Wallet;
  let resolver: Wallet;
  let srcChainConfig: any;
  let dstChainConfig: any;
  let srcResolverContract: Contract;
  let dstResolverContract: Contract;
  let srcEscrowFactory: Contract;
  let dstEscrowFactory: Contract;
  let srcToken: Contract;
  let dstToken: Contract;

  before(async () => {
    // Initialize providers
    srcProvider = new JsonRpcProvider(TEST_CHAINS.source.rpcUrl);
    dstProvider = new JsonRpcProvider(TEST_CHAINS.destination.rpcUrl);

    // Initialize wallets
    const userPrivateKey = process.env.TEST_USER_PRIVATE_KEY || Wallet.createRandom().privateKey;
    const resolverPrivateKey = process.env.RESOLVER_0_PRIVATE_KEY!;
    
    user = new Wallet(userPrivateKey);
    resolver = new Wallet(resolverPrivateKey);

    // Get chain configurations
    const deployments = allDeployments as any;
    srcChainConfig = deployments[TEST_CHAINS.source.chainId];
    dstChainConfig = deployments[TEST_CHAINS.destination.chainId];

    // Initialize contracts
    srcResolverContract = new Contract(
      srcChainConfig.resolvers[0],
      RESOLVER_ABI,
      resolver.connect(srcProvider)
    );

    dstResolverContract = new Contract(
      dstChainConfig.resolvers[0],
      RESOLVER_ABI,
      resolver.connect(dstProvider)
    );

    srcEscrowFactory = new Contract(
      srcChainConfig.escrowFactory,
      ESCROW_FACTORY_ABI,
      srcProvider
    );

    dstEscrowFactory = new Contract(
      dstChainConfig.escrowFactory,
      ESCROW_FACTORY_ABI,
      dstProvider
    );

    // Initialize tokens (USDT)
    srcToken = new Contract(srcChainConfig.usdt, ERC20_ABI, user.connect(srcProvider));
    dstToken = new Contract(dstChainConfig.usdt, ERC20_ABI, resolver.connect(dstProvider));

    console.log("Test setup complete:");
    console.log("- User address:", user.address);
    console.log("- Resolver address:", resolver.address);
    console.log("- Source chain:", TEST_CHAINS.source.chainId);
    console.log("- Destination chain:", TEST_CHAINS.destination.chainId);
  });

  describe("Cross-chain USDT swap", () => {
    it("should execute a complete cross-chain swap flow", async function () {
      // Skip if not enough balance
      const userBalance = await srcToken.balanceOf(user.address);
      if (userBalance < parseUnits("10", 6)) {
        this.skip();
      }

      const swapAmount = parseUnits("10", 6); // 10 USDT
      const secret = uint8ArrayToHex(Buffer.from("test_secret_" + Date.now()));
      
      // Get current timestamp
      const currentBlock = await srcProvider.getBlock('latest');
      const srcTimestamp = BigInt(currentBlock!.timestamp);

      // Create cross-chain order using SDK
      const order = Sdk.CrossChainOrder.new(
        new Address(srcChainConfig.escrowFactory),
        {
          salt: Sdk.randBigInt(1000n),
          maker: new Address(user.address),
          makingAmount: swapAmount,
          takingAmount: parseUnits("9.9", 6), // 0.99 rate
          makerAsset: new Address(srcChainConfig.usdt),
          takerAsset: new Address(dstChainConfig.usdt),
        },
        {
          hashLock: Sdk.HashLock.forSingleFill(secret),
          timeLocks: Sdk.TimeLocks.new({
            srcWithdrawal: 300n, // 5 minutes
            srcPublicWithdrawal: 600n, // 10 minutes
            srcCancellation: 900n, // 15 minutes
            srcPublicCancellation: 1200n, // 20 minutes
            dstWithdrawal: 300n, // 5 minutes
            dstPublicWithdrawal: 600n, // 10 minutes
            dstCancellation: 900n, // 15 minutes
          }),
          srcChainId: TEST_CHAINS.source.chainId,
          dstChainId: TEST_CHAINS.destination.chainId,
          srcSafetyDeposit: parseUnits("0.001", 18),
          dstSafetyDeposit: parseUnits("0.001", 18),
        },
        {
          auction: new Sdk.AuctionDetails({
            initialRateBump: 0,
            points: [],
            duration: 180n, // 3 minutes
            startTime: srcTimestamp,
          }),
          whitelist: [
            {
              address: new Address(srcChainConfig.resolvers[0]),
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

      const orderHash = order.getOrderHash(TEST_CHAINS.source.chainId);
      console.log("Created order with hash:", orderHash);

      // Step 1: User approves tokens to LimitOrderProtocol
      console.log("Step 1: Approving tokens...");
      const approveTx = await srcToken.approve(
        srcChainConfig.limitOrderProtocol,
        swapAmount
      );
      await approveTx.wait();

      // Step 2: User signs the order
      console.log("Step 2: Signing order...");
      const signature = await user.signTypedData(
        {
          name: "1inch Limit Order Protocol",
          version: "4",
          chainId: TEST_CHAINS.source.chainId,
          verifyingContract: srcChainConfig.limitOrderProtocol,
        },
        {
          Order: [
            { name: "salt", type: "uint256" },
            { name: "maker", type: "address" },
            { name: "receiver", type: "address" },
            { name: "makerAsset", type: "address" },
            { name: "takerAsset", type: "address" },
            { name: "makingAmount", type: "uint256" },
            { name: "takingAmount", type: "uint256" },
            { name: "makerTraits", type: "uint256" },
          ],
        },
        order.build()
      );

      // Step 3: Resolver deploys source escrow
      console.log("Step 3: Deploying source escrow...");
      const { r, yParityAndS: vs } = Signature.from(signature);
      const takerTraits = Sdk.TakerTraits.default()
        .setExtension(order.extension)
        .setAmountMode(Sdk.AmountMode.maker)
        .setAmountThreshold(order.takingAmount);

      const { args, trait } = takerTraits.encode();
      const srcImmutables = order.toSrcImmutables(
        TEST_CHAINS.source.chainId,
        new Address(srcChainConfig.resolvers[0]),
        swapAmount,
        order.escrowExtension.hashLockInfo
      );

      const srcDeployTx = await srcResolverContract.deploySrc(
        srcImmutables.build(),
        order.build(),
        r,
        vs,
        swapAmount,
        trait,
        args,
        { value: order.escrowExtension.srcSafetyDeposit }
      );

      const srcReceipt = await srcDeployTx.wait();
      console.log("Source escrow deployed in tx:", srcReceipt.hash);

      // Get the escrow address
      const srcEscrowAddress = await srcEscrowFactory.addressOfEscrowSrc(
        srcImmutables.build()
      );
      console.log("Source escrow address:", srcEscrowAddress);

      // Verify tokens were transferred
      const escrowBalance = await srcToken.balanceOf(srcEscrowAddress);
      expect(escrowBalance).to.equal(swapAmount);
      console.log("Source escrow balance verified:", formatUnits(escrowBalance, 6), "USDT");

      // Step 4: Resolver deploys destination escrow
      console.log("Step 4: Deploying destination escrow...");
      
      // First, ensure resolver contract has tokens
      const resolverContractBalance = await dstToken.balanceOf(dstChainConfig.resolvers[0]);
      if (resolverContractBalance < parseUnits("9.9", 6)) {
        console.log("Funding resolver contract with destination tokens...");
        const fundTx = await dstToken.transfer(
          dstChainConfig.resolvers[0],
          parseUnits("100", 6)
        );
        await fundTx.wait();
      }

      // Approve factory to spend tokens
      const resolverContractSigner = await resolver.connect(dstProvider).getAddress();
      console.log("Resolver contract needs to approve factory...");
      // Note: In production, this would be done through the resolver contract's arbitraryCalls

      const dstImmutables = order.toDstImmutables(
        TEST_CHAINS.destination.chainId,
        new Address(dstChainConfig.resolvers[0]),
        parseUnits("9.9", 6),
        order.escrowExtension.hashLockInfo
      );

      const dstDeployTx = await dstResolverContract.deployDst(
        dstImmutables.build(),
        dstImmutables.timeLocks.toSrcTimeLocks().privateCancellation,
        { value: order.escrowExtension.dstSafetyDeposit }
      );

      const dstReceipt = await dstDeployTx.wait();
      console.log("Destination escrow deployed in tx:", dstReceipt.hash);

      // Get destination escrow address
      const dstEscrowAddress = await dstEscrowFactory.addressOfEscrowDst(
        dstImmutables.build()
      );
      console.log("Destination escrow address:", dstEscrowAddress);

      // Step 5: User withdraws from destination escrow
      console.log("Step 5: User withdrawing from destination...");
      const dstEscrow = new Contract(
        dstEscrowAddress,
        ESCROW_ABI,
        user.connect(dstProvider)
      );

      const userDstBalanceBefore = await dstToken.balanceOf(user.address);
      
      const withdrawTx = await dstEscrow.withdraw(secret, dstImmutables.build());
      await withdrawTx.wait();
      
      const userDstBalanceAfter = await dstToken.balanceOf(user.address);
      const received = userDstBalanceAfter - userDstBalanceBefore;
      
      expect(received).to.equal(parseUnits("9.9", 6));
      console.log("User received:", formatUnits(received, 6), "USDT on destination chain");

      // Step 6: Resolver withdraws from source escrow
      console.log("Step 6: Resolver withdrawing from source...");
      const srcEscrow = new Contract(
        srcEscrowAddress,
        ESCROW_ABI,
        resolver.connect(srcProvider)
      );

      const resolverSrcBalanceBefore = await srcToken.balanceOf(resolver.address);
      
      const resolverWithdrawTx = await srcEscrow.withdraw(secret, srcImmutables.build());
      await resolverWithdrawTx.wait();
      
      const resolverSrcBalanceAfter = await srcToken.balanceOf(resolver.address);
      const resolverReceived = resolverSrcBalanceAfter - resolverSrcBalanceBefore;
      
      expect(resolverReceived).to.equal(swapAmount);
      console.log("Resolver received:", formatUnits(resolverReceived, 6), "USDT on source chain");

      console.log("✅ Cross-chain swap completed successfully!");
    });
  });

  describe("Order cancellation flow", () => {
    it("should allow cancellation when no secret is revealed", async function () {
      this.skip(); // Skip for now as it requires waiting for timelock periods
    });
  });
});

// Helper function to increase time in tests
async function increaseTime(provider: JsonRpcProvider, seconds: number) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}