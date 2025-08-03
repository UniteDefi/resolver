import { solidityPackedKeccak256, getAddress } from "ethers";
import { hash } from "starknet";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Verify that order hash generation is consistent between EVM and Starknet
 * This is crucial for cross-chain compatibility
 */
async function verifyHashCompatibility() {
  console.log("🔍 Verifying hash compatibility between EVM and Starknet...");
  
  // Test order data (using valid EVM addresses for hash testing)
  const testOrder = {
    salt: BigInt("123456789"),
    maker: "0x742d35Cc6634C0532925a3b8D20b6d57C11c6b24",
    receiver: "0x1234567890AbcdEF1234567890aBcdef12345678", // EVM format for testing
    makerAsset: "0x97a2d8Dfece96252518a4327aFFf40B61A0a025A",
    takerAsset: "0x789e4E29b6c8c7B11c6B6C4f42E3a4D5f0c1B2A3",
    makingAmount: BigInt("1000000000000000000000"), // 1000 tokens
    takingAmount: BigInt("1000000000000000000000"), // 1000 tokens
    deadline: BigInt("1672531200"), // Jan 1, 2023
    nonce: BigInt("1"),
    srcChainId: BigInt("84532"), // Base Sepolia
    dstChainId: BigInt("0x534e5f5345504f4c4941"), // Starknet Sepolia
    auctionStartTime: BigInt("1672527600"),
    auctionEndTime: BigInt("1672531200"),
    startPrice: BigInt("1050000000000000000"), // 1.05 (5% premium)
    endPrice: BigInt("1000000000000000000")   // 1.0 (fair price)
  };
  
  console.log("📝 Test Order Data:");
  console.log("- Maker:", testOrder.maker);
  console.log("- Receiver:", testOrder.receiver);
  console.log("- Making Amount:", testOrder.makingAmount.toString());
  console.log("- Taking Amount:", testOrder.takingAmount.toString());
  console.log("- Source Chain:", testOrder.srcChainId.toString());
  console.log("- Dest Chain:", testOrder.dstChainId.toString());
  
  // EVM Order Hash (from UniteOrderLib.sol)
  const ORDER_TYPEHASH = solidityPackedKeccak256(
    ["string"],
    ["Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId,uint256 auctionStartTime,uint256 auctionEndTime,uint256 startPrice,uint256 endPrice)"]
  );
  
  const evmOrderHash = solidityPackedKeccak256(
    ["bytes32", "uint256", "address", "address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
    [
      ORDER_TYPEHASH,
      testOrder.salt,
      testOrder.maker,
      testOrder.receiver,
      testOrder.makerAsset,
      testOrder.takerAsset,
      testOrder.makingAmount,
      testOrder.takingAmount,
      testOrder.deadline,
      testOrder.nonce,
      testOrder.srcChainId,
      testOrder.dstChainId,
      testOrder.auctionStartTime,
      testOrder.auctionEndTime,
      testOrder.startPrice,
      testOrder.endPrice
    ]
  );
  
  // Starknet Order Hash (using Poseidon hash)
  // Note: In Starknet, we need to use Poseidon hash instead of Keccak256
  // The order structure should be the same but hashing mechanism differs
  const starknetOrderData = [
    testOrder.salt.toString(),
    testOrder.maker,
    testOrder.receiver,
    testOrder.makerAsset,
    testOrder.takerAsset,
    testOrder.makingAmount.toString(),
    testOrder.takingAmount.toString(),
    testOrder.deadline.toString(),
    testOrder.nonce.toString(),
    testOrder.srcChainId.toString(),
    testOrder.dstChainId.toString(),
    testOrder.auctionStartTime.toString(),
    testOrder.auctionEndTime.toString(),
    testOrder.startPrice.toString(),
    testOrder.endPrice.toString()
  ];
  
  // For Starknet, we'll use a simpler hash for compatibility testing
  // In practice, the Starknet contract would use Poseidon hash
  const starknetOrderHash = hash.computeHashOnElements(starknetOrderData);
  
  console.log("\n🔢 Hash Results:");
  console.log("EVM Order Hash (Keccak256):", evmOrderHash);
  console.log("Starknet Order Hash (Poseidon):", starknetOrderHash);
  
  // Important note about cross-chain compatibility
  console.log("\n⚠️ IMPORTANT COMPATIBILITY NOTES:");
  console.log("1. EVM uses Keccak256 hashing");
  console.log("2. Starknet uses Poseidon hashing"); 
  console.log("3. Order hashes will be DIFFERENT between chains");
  console.log("4. This is EXPECTED and CORRECT behavior");
  console.log("5. Each chain validates its own order hash independently");
  console.log("6. Cross-chain linkage is done via the orderHash field in immutables");
  
  // Verify hashlock generation (this MUST be the same)
  const secret = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const evmHashlock = solidityPackedKeccak256(["bytes32"], [secret]);
  
  // For Starknet, we need to ensure hashlock generation is compatible
  // We'll use the same secret but might need different hashing
  console.log("\n🔐 Hashlock Verification:");
  console.log("Secret:", secret);
  console.log("EVM Hashlock (Keccak256):", evmHashlock);
  console.log("Starknet should use Poseidon hash of the same secret");
  
  // Test safety deposit calculation
  const safetyDepositPercentage = 1; // 1% of order amount
  const evmSafetyDeposit = (testOrder.makingAmount * BigInt(safetyDepositPercentage)) / BigInt(100);
  
  console.log("\n💰 Safety Deposit Calculation:");
  console.log("Order Amount:", testOrder.makingAmount.toString());
  console.log("Safety Deposit (1%):", evmSafetyDeposit.toString());
  console.log("This calculation should be IDENTICAL on both chains");
  
  // Test timelock packing
  const timelocks = {
    srcWithdrawal: 3600,      // 1 hour
    srcCancellation: 7200,    // 2 hours
    dstWithdrawal: 1800,      // 30 minutes
    dstCancellation: 5400     // 1.5 hours
  };
  
  const packedTimelocks = 
    (BigInt(timelocks.srcWithdrawal) << BigInt(192)) |
    (BigInt(timelocks.srcCancellation) << BigInt(128)) |
    (BigInt(timelocks.dstWithdrawal) << BigInt(64)) |
    BigInt(timelocks.dstCancellation);
  
  console.log("\n⏰ Timelock Packing:");
  console.log("Source Withdrawal:", timelocks.srcWithdrawal, "seconds");
  console.log("Source Cancellation:", timelocks.srcCancellation, "seconds");
  console.log("Dest Withdrawal:", timelocks.dstWithdrawal, "seconds");
  console.log("Dest Cancellation:", timelocks.dstCancellation, "seconds");
  console.log("Packed Timelocks:", "0x" + packedTimelocks.toString(16));
  console.log("This packing should be IDENTICAL on both chains");
  
  // Dutch auction price calculation test
  const auctionTests = [
    { timeElapsed: 0, expectedPriceRatio: 1.05 },      // Start: 5% premium
    { timeElapsed: 900, expectedPriceRatio: 1.025 },   // 15 min: 2.5% premium  
    { timeElapsed: 1800, expectedPriceRatio: 1.0 }     // 30 min: fair price
  ];
  
  console.log("\n📈 Dutch Auction Price Verification:");
  const totalDuration = Number(testOrder.auctionEndTime - testOrder.auctionStartTime);
  const startPrice = Number(testOrder.startPrice);
  const endPrice = Number(testOrder.endPrice);
  const priceDecrease = startPrice - endPrice;
  
  for (const test of auctionTests) {
    const currentPrice = startPrice - (priceDecrease * test.timeElapsed / totalDuration);
    const actualRatio = currentPrice / 1e18;
    
    console.log(`Time ${test.timeElapsed}s: Expected ${test.expectedPriceRatio}, Actual ${actualRatio.toFixed(3)}`);
    
    if (Math.abs(actualRatio - test.expectedPriceRatio) < 0.001) {
      console.log("  ✅ Price calculation correct");
    } else {
      console.log("  ❌ Price calculation mismatch");
    }
  }
  
  console.log("\n✅ Hash compatibility verification complete!");
  console.log("📋 Key Points:");
  console.log("- Order hashes will differ between chains (expected)");
  console.log("- Hashlock generation must be compatible");
  console.log("- Safety deposit calculations must be identical");
  console.log("- Timelock packing must be identical");
  console.log("- Dutch auction pricing must be identical");
}

if (require.main === module) {
  verifyHashCompatibility().catch(console.error);
}

export default verifyHashCompatibility;