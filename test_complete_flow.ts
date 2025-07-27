import { ethers } from "ethers";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";

dotenv.config();

// Configuration
const RELAYER_URL = "http://localhost:3000";
const CHAINS = {
  BASE_SEPOLIA: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  },
  ARBITRUM_SEPOLIA: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  }
};

// Test report data
const testReport = {
  testId: `test_${Date.now()}`,
  startTime: new Date().toISOString(),
  transactions: {
    source: [] as any[],
    destination: [] as any[]
  },
  signatures: [] as any[],
  events: [] as any[],
  finalBalances: {} as any
};

async function logTx(chain: string, description: string, tx: any) {
  const entry = {
    chain,
    description,
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value?.toString() || "0",
    timestamp: new Date().toISOString()
  };
  
  if (chain === "Base Sepolia") {
    testReport.transactions.source.push(entry);
  } else {
    testReport.transactions.destination.push(entry);
  }
  
  console.log(`[${chain}] ${description}: ${tx.hash}`);
}

async function executeCompleteFlow() {
  console.log("\n🚀 === COMPLETE CROSS-CHAIN SWAP TEST ===");
  console.log("Test ID:", testReport.testId);
  console.log("User swaps 10 USDT (Base) → DAI (Arbitrum)\n");

  // Load deployments
  const tokenDeployments = {
    base_sepolia: {
      mockUSDT: "0x2024B9fe781106c3966130e0Fa26a15FbA52a91C",
      mockLINK: "0x8dA8711fd2D16B76C32DbCFF1227CfDe596DbBc1"
    },
    arbitrum_sepolia: {
      mockUSDT: "0x694273F2FaE10d36D552086Ce3c6172a8707eF43", // Using as DAI
      mockLINK: "0x2bF2b3820a04eeC8Fc19A62C8221a1B42E67CE21"
    }
  };

  // Setup providers and wallets
  const baseProvider = new ethers.JsonRpcProvider(CHAINS.BASE_SEPOLIA.rpcUrl);
  const arbProvider = new ethers.JsonRpcProvider(CHAINS.ARBITRUM_SEPOLIA.rpcUrl);
  
  const user = new ethers.Wallet(process.env.SELLER_WALLET_PRIVATE_KEY!, baseProvider);
  const resolver = new ethers.Wallet(process.env.RESOLVER1_WALLET_PRIVATE_KEY!, baseProvider);
  
  console.log("👥 Participants:");
  console.log(`  User: ${user.address}`);
  console.log(`  Resolver: ${resolver.address}\n`);

  // Token ABIs
  const tokenAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ];

  const usdtBase = new ethers.Contract(tokenDeployments.base_sepolia.mockUSDT, tokenAbi, baseProvider);
  const daiArb = new ethers.Contract(tokenDeployments.arbitrum_sepolia.mockUSDT, tokenAbi, arbProvider);

  // Check initial balances
  console.log("💰 Initial Balances:");
  const userUsdtStart = await usdtBase.balanceOf(user.address);
  const userDaiStart = await daiArb.balanceOf(user.address);
  const resolverUsdtStart = await usdtBase.balanceOf(resolver.address);
  const resolverDaiStart = await daiArb.balanceOf(resolver.address);
  
  console.log(`  User: ${ethers.formatUnits(userUsdtStart, 6)} USDT (Base), ${ethers.formatUnits(userDaiStart, 6)} DAI (Arbitrum)`);
  console.log(`  Resolver: ${ethers.formatUnits(resolverUsdtStart, 6)} USDT (Base), ${ethers.formatUnits(resolverDaiStart, 6)} DAI (Arbitrum)\n`);

  // Step 1: Pre-approve tokens
  console.log("📝 Step 1: User pre-approves USDT");
  const escrowFactory = "0xd65eB2D57FfcC321eE5D5Ac7E97C7c162a6159de";
  
  const currentAllowance = await usdtBase.allowance(user.address, escrowFactory);
  if (currentAllowance < ethers.parseUnits("100", 6)) {
    const approveTx = await usdtBase.connect(user).approve(escrowFactory, ethers.parseUnits("1000", 6));
    await approveTx.wait();
    await logTx("Base Sepolia", "Pre-approve USDT", approveTx);
  }

  // Step 2: Create gasless swap request
  console.log("\n✍️ Step 2: User signs gasless swap request");
  
  const swapAmount = ethers.parseUnits("10", 6);
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  
  testReport.events.push({
    type: "secret_generated",
    secret: ethers.hexlify(secret),
    secretHash: secretHash
  });

  const swapRequest = {
    userAddress: user.address,
    srcChainId: CHAINS.BASE_SEPOLIA.chainId,
    srcToken: usdtBase.target,
    srcAmount: swapAmount.toString(),
    dstChainId: CHAINS.ARBITRUM_SEPOLIA.chainId,
    dstToken: daiArb.target,
    secretHash: secretHash,
    startPrice: ethers.parseUnits("11", 6).toString(),
    endPrice: ethers.parseUnits("9", 6).toString(),
    auctionDuration: 300,
    signature: ""
  };

  // Sign the request
  const message = ethers.solidityPackedKeccak256(
    ["address", "uint256", "address", "uint256", "uint256", "address", "bytes32"],
    [
      swapRequest.userAddress,
      swapRequest.srcChainId,
      swapRequest.srcToken,
      swapRequest.srcAmount,
      swapRequest.dstChainId,
      swapRequest.dstToken,
      swapRequest.secretHash
    ]
  );

  swapRequest.signature = await user.signMessage(ethers.getBytes(message));
  
  testReport.signatures.push({
    type: "swap_request",
    signer: user.address,
    data: swapRequest
  });

  // Step 3: Send to relayer
  console.log("\n📤 Step 3: Sending to relayer service");
  
  try {
    const response = await axios.post(`${RELAYER_URL}/api/create-swap`, {
      swapRequest,
      secret: ethers.hexlify(secret)
    });
    
    console.log(`✅ Auction created: ${response.data.auctionId}`);
    
    testReport.events.push({
      type: "auction_created",
      auctionId: response.data.auctionId,
      txHash: response.data.txHash
    });

    // Wait for resolvers to pick up
    console.log("\n⏳ Waiting for resolvers to fill auction...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check auction status
    const statusResponse = await axios.get(`${RELAYER_URL}/api/auction-status/${response.data.auctionId}`);
    console.log("\nAuction Status:", statusResponse.data);

  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message);
  }

  // Check final balances
  console.log("\n💰 Final Balances:");
  const userUsdtEnd = await usdtBase.balanceOf(user.address);
  const userDaiEnd = await daiArb.balanceOf(user.address);
  const resolverUsdtEnd = await usdtBase.balanceOf(resolver.address);
  const resolverDaiEnd = await daiArb.balanceOf(resolver.address);
  
  console.log(`  User: ${ethers.formatUnits(userUsdtEnd, 6)} USDT (Base), ${ethers.formatUnits(userDaiEnd, 6)} DAI (Arbitrum)`);
  console.log(`  Resolver: ${ethers.formatUnits(resolverUsdtEnd, 6)} USDT (Base), ${ethers.formatUnits(resolverDaiEnd, 6)} DAI (Arbitrum)`);

  testReport.finalBalances = {
    user: {
      base: { USDT: userUsdtEnd.toString() },
      arbitrum: { DAI: userDaiEnd.toString() }
    },
    resolver: {
      base: { USDT: resolverUsdtEnd.toString() },
      arbitrum: { DAI: resolverDaiEnd.toString() }
    }
  };

  // Save report
  testReport.endTime = new Date().toISOString();
  fs.writeFileSync(
    `test_report_${testReport.testId}.json`,
    JSON.stringify(testReport, null, 2)
  );

  console.log(`\n📄 Test report saved to: test_report_${testReport.testId}.json`);
}

executeCompleteFlow().catch(console.error);