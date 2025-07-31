import { Wallet, parseUnits } from "ethers";
import * as Sdk from "@1inch/cross-chain-sdk";
import { uint8ArrayToHex, UINT_40_MAX } from "@1inch/byte-utils";
import * as dotenv from "dotenv";
import allDeployments from "../../deployments.json";

dotenv.config();

const { Address } = Sdk;

/**
 * Example: How to create a proper cross-chain order using the 1inch SDK
 * 
 * This demonstrates the correct way to create an order that will work with
 * the EscrowFactory's postInteraction hook.
 */
async function createCrossChainOrderExample() {
  // Configuration
  const srcChainId = 11155111; // Ethereum Sepolia
  const dstChainId = 84532; // Base Sepolia
  
  const deployments = allDeployments as any;
  const srcChainConfig = deployments[srcChainId];
  const dstChainConfig = deployments[dstChainId];

  // User and amounts
  const userAddress = "0x82C4Ae2bdD2f8cc387ea0c5E27963F36C1fcd0DD"; // Example user
  const srcAmount = parseUnits("100", 6); // 100 USDT
  const dstAmount = parseUnits("99", 6); // 99 USDT (0.99 rate)

  // Create secret for HTLC
  const secret = uint8ArrayToHex(Buffer.from("my_secret_" + Date.now()));
  
  // Create the cross-chain order
  const order = Sdk.CrossChainOrder.new(
    new Address(srcChainConfig.escrowFactory), // IMPORTANT: Factory address as the interaction target
    {
      salt: Sdk.randBigInt(1000n),
      maker: new Address(userAddress),
      makingAmount: srcAmount,
      takingAmount: dstAmount,
      makerAsset: new Address(srcChainConfig.usdt), // Source chain token
      takerAsset: new Address(dstChainConfig.usdt), // Destination chain token (different chain!)
    },
    {
      // Hash-time-locked contract configuration
      hashLock: Sdk.HashLock.forSingleFill(secret),
      timeLocks: Sdk.TimeLocks.new({
        srcWithdrawal: 300n, // 5 minutes for resolver to withdraw on source
        srcPublicWithdrawal: 600n, // 10 minutes for public withdrawal
        srcCancellation: 900n, // 15 minutes for user to cancel
        srcPublicCancellation: 1200n, // 20 minutes for public cancellation
        dstWithdrawal: 300n, // 5 minutes for user to withdraw on destination
        dstPublicWithdrawal: 600n, // 10 minutes for public withdrawal
        dstCancellation: 900n, // 15 minutes for resolver to cancel
      }),
      srcChainId,
      dstChainId,
      srcSafetyDeposit: parseUnits("0.001", 18), // 0.001 ETH safety deposit
      dstSafetyDeposit: parseUnits("0.001", 18), // 0.001 ETH safety deposit
    },
    {
      // Dutch auction configuration
      auction: new Sdk.AuctionDetails({
        initialRateBump: 0, // No initial bump
        points: [], // Linear auction
        duration: 180n, // 3 minute auction
        startTime: BigInt(Math.floor(Date.now() / 1000)),
      }),
      // Whitelist specific resolvers
      whitelist: [
        {
          address: new Address(srcChainConfig.resolvers[0]),
          allowFrom: 0n, // Can participate immediately
        },
        {
          address: new Address(srcChainConfig.resolvers[1]),
          allowFrom: 60n, // Can participate after 60 seconds
        },
      ],
      resolvingStartTime: 0n, // Resolvers can start immediately
    },
    {
      // Order traits
      nonce: Sdk.randBigInt(UINT_40_MAX),
      allowPartialFills: false, // Single fill only
      allowMultipleFills: false, // Cannot be filled multiple times
    }
  );

  // Get the order hash
  const orderHash = order.getOrderHash(srcChainId);
  console.log("Order hash:", orderHash);

  // The order extension contains the postInteraction data
  console.log("\nOrder extension (hex):", order.extension);
  
  // This extension includes:
  // 1. The EscrowFactory address as the postInteraction target
  // 2. All cross-chain parameters (timelocks, safety deposits, etc.)
  // 3. Whitelist and auction details

  // Show the immutables that will be used for escrow creation
  const srcImmutables = order.toSrcImmutables(
    srcChainId,
    new Address(srcChainConfig.resolvers[0]),
    srcAmount,
    order.escrowExtension.hashLockInfo
  );

  console.log("\nSource escrow immutables:", srcImmutables.build());

  // Show how to sign the order (in production, the user would do this)
  const userWallet = Wallet.createRandom();
  const domain = {
    name: "1inch Limit Order Protocol",
    version: "4",
    chainId: srcChainId,
    verifyingContract: srcChainConfig.limitOrderProtocol,
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
      { name: "makerTraits", type: "uint256" },
    ],
  };

  // Note: In production, the user signs this
  const orderData = order.build();
  console.log("\nOrder data for signing:", orderData);

  console.log("\n✅ This order is properly formatted for cross-chain swaps!");
  console.log("\nKey points:");
  console.log("1. The order extension includes the EscrowFactory as postInteraction");
  console.log("2. Cross-chain parameters are encoded in the extension");
  console.log("3. The takerAsset is on a different chain (this is OK!)");
  console.log("4. The LimitOrderProtocol will call EscrowFactory.postInteraction after token transfer");
  console.log("5. The postInteraction will create the source escrow with all necessary data");

  return order;
}

// Run the example
if (require.main === module) {
  createCrossChainOrderExample()
    .then(() => console.log("\nExample completed!"))
    .catch(console.error);
}

export { createCrossChainOrderExample };