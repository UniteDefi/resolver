#!/usr/bin/env node
import { ethers } from "ethers";
import axios from "axios";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RESOLVER_KEY = process.env.RESOLVER1_WALLET_PRIVATE_KEY;

console.log("🔧 Environment Check:");
console.log("ALCHEMY_API_KEY:", ALCHEMY_API_KEY ? `${ALCHEMY_API_KEY.slice(0, 5)}...` : "❌ NOT FOUND");
console.log("PRIVATE_KEY:", PRIVATE_KEY ? "✅ Loaded" : "❌ NOT FOUND");
console.log("RESOLVER_KEY:", RESOLVER_KEY ? "✅ Loaded" : "❌ NOT FOUND");

if (!ALCHEMY_API_KEY || !PRIVATE_KEY || !RESOLVER_KEY) {
  console.error("\n❌ Missing required environment variables!");
  console.log("Make sure .env file exists in:", __dirname);
  process.exit(1);
}

// Configuration
const RELAYER_URL = "http://localhost:3000";

const chains = {
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://base-sepolia.blockscout.com",
    tokens: {
      USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
      DAI: "0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9"
    },
    escrowFactory: "0xd65eB2D57FfcC321eE5D5Ac7E97C7c162a6159de"
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://arbitrum-sepolia.blockscout.com",
    tokens: {
      USDT: "0xf3c3351D6Bd0098EEb7C6E0f7D26B4874D89a4DB",
      DAI: "0xc34aeFEa232956542C5b2f2EE55fD5c378B35c03"
    },
    escrowFactory: "0x6a4499e82EeD912e27524e9fCC3a04C6821b885e"
  }
};

// ERC20 ABI
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// RELAYER CONTRACT ABI
const RELAYER_ABI = [
  "function authorizeRelayer(address relayer) external",
  "function registerOrder(bytes32 orderId, address user, address token, uint256 amount, bytes32 secretHash) external",
  "function transferUserFundsToEscrow(bytes32 orderId, address escrowAddress) external",
  "function checkUserApproval(address user, address token, uint256 amount) view returns (bool)",
  "function getOrder(bytes32 orderId) view returns (address user, address srcToken, uint256 amount, address srcEscrow, bool fundsTransferred, uint256 timestamp)",
  "event OrderCreated(bytes32 indexed orderId, address indexed user, address srcToken, uint256 amount, bytes32 secretHash)",
  "event UserFundsTransferred(bytes32 indexed orderId, address indexed user, address indexed escrow, address token, uint256 amount)"
];

async function testActualImplementation() {
  console.log("\n🚀 TESTING ACTUAL CROSS-CHAIN SWAP IMPLEMENTATION");
  console.log("=" .repeat(60));
  
  // 1. Check if relayer service is running
  console.log("\n1️⃣ Checking relayer service...");
  try {
    const health = await axios.get(`${RELAYER_URL}/health`);
    console.log("✅ Relayer service is running");
    console.log("Chains:", health.data.chains.map((c: any) => c.name).join(", "));
  } catch (error) {
    console.error("❌ Relayer service not running. Start it first!");
    console.log("Run: cd ../relayer && npm run dev");
    return;
  }
  
  // 2. Setup providers and wallets
  console.log("\n2️⃣ Setting up wallets...");
  const baseProvider = new ethers.JsonRpcProvider(chains.baseSepolia.rpcUrl);
  const arbProvider = new ethers.JsonRpcProvider(chains.arbitrumSepolia.rpcUrl);
  
  const userWallet = new ethers.Wallet(PRIVATE_KEY, baseProvider);
  const userWalletArb = new ethers.Wallet(PRIVATE_KEY, arbProvider);
  
  console.log("User Address:", userWallet.address);
  
  // 3. Check balances
  console.log("\n3️⃣ Checking balances...");
  const srcToken = new ethers.Contract(chains.baseSepolia.tokens.USDT, ERC20_ABI, userWallet);
  const dstToken = new ethers.Contract(chains.arbitrumSepolia.tokens.DAI, ERC20_ABI, userWalletArb);
  
  try {
    const [srcBalance, dstBalance, srcSymbol, dstSymbol] = await Promise.all([
      srcToken.balanceOf(userWallet.address),
      dstToken.balanceOf(userWallet.address),
      srcToken.symbol(),
      dstToken.symbol()
    ]);
    
    console.log(`Base Sepolia ${srcSymbol}:`, ethers.formatUnits(srcBalance, 6));
    console.log(`Arbitrum Sepolia ${dstSymbol}:`, ethers.formatUnits(dstBalance, 6));
    
    if (srcBalance === 0n) {
      console.error("\n❌ No USDT balance! Get test tokens first.");
      console.log("Faucet: https://docs.base.org/tools/network-faucets");
      return;
    }
  } catch (error) {
    console.error("❌ Error checking balances:", error.message);
    console.log("Make sure you're connected to the right network");
    return;
  }
  
  // 4. Deploy or load RelayerContract
  console.log("\n4️⃣ Loading RelayerContract address...");
  let relayerAddress: string;
  
  try {
    // Check if already deployed
    const deploymentsPath = path.join(__dirname, "relayer_contract_deployments.json");
    if (fs.existsSync(deploymentsPath)) {
      const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
      relayerAddress = deployments.baseSepolia?.relayerContract;
      console.log("✅ Found deployed RelayerContract:", relayerAddress);
    } else {
      console.log("⚠️ No deployment found. Deploy RelayerContract first!");
      console.log("Run: npx ts-node scripts/deploy_relayer_contract.ts");
      return;
    }
  } catch (error) {
    console.error("❌ Error loading deployments:", error);
    return;
  }
  
  // 5. Approve RelayerContract
  console.log("\n5️⃣ Approving RelayerContract...");
  const swapAmount = ethers.parseUnits("10", 6); // 10 USDT
  
  const relayerContract = new ethers.Contract(relayerAddress, RELAYER_ABI, userWallet);
  const currentAllowance = await srcToken.allowance(userWallet.address, relayerAddress);
  
  if (currentAllowance < swapAmount) {
    console.log(`Approving ${ethers.formatUnits(swapAmount, 6)} USDT...`);
    const approveTx = await srcToken.approve(relayerAddress, swapAmount);
    console.log("Approval TX:", approveTx.hash);
    console.log(`View: ${chains.baseSepolia.blockExplorer}/tx/${approveTx.hash}`);
    await approveTx.wait();
    console.log("✅ Approved!");
  } else {
    console.log("✅ Already approved:", ethers.formatUnits(currentAllowance, 6), "USDT");
  }
  
  // 6. Create swap order
  console.log("\n6️⃣ Creating swap order...");
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  
  console.log("Secret:", ethers.hexlify(secret));
  console.log("Secret Hash:", secretHash);
  
  const swapRequest = {
    userAddress: userWallet.address,
    signature: "0x", // Simplified
    srcChainId: chains.baseSepolia.chainId,
    srcToken: chains.baseSepolia.tokens.USDT,
    srcAmount: swapAmount.toString(),
    dstChainId: chains.arbitrumSepolia.chainId,
    dstToken: chains.arbitrumSepolia.tokens.DAI,
    secretHash: secretHash,
    minAcceptablePrice: ethers.parseUnits("9.5", 6).toString(),
    orderDuration: 300
  };
  
  try {
    const createResponse = await axios.post(`${RELAYER_URL}/api/create-swap`, {
      swapRequest,
      secret: ethers.hexlify(secret)
    });
    
    console.log("✅ Order created!");
    console.log("Order ID:", createResponse.data.orderId);
    console.log("Market Price:", ethers.formatUnits(createResponse.data.marketPrice || "10000000", 6), "DAI");
    
    // 7. Monitor order
    console.log("\n7️⃣ Monitoring order progress...");
    const orderId = createResponse.data.orderId;
    let lastStatus = "";
    
    // Also check on-chain order registration
    const orderInfo = await relayerContract.getOrder(orderId);
    console.log("\nOn-chain order info:");
    console.log("User:", orderInfo.user);
    console.log("Token:", orderInfo.srcToken);
    console.log("Amount:", ethers.formatUnits(orderInfo.amount, 6));
    
    // Monitor for 2 minutes
    const startTime = Date.now();
    while (Date.now() - startTime < 120000) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        const status = await axios.get(`${RELAYER_URL}/api/order-status/${orderId}`);
        if (status.data.status !== lastStatus) {
          console.log(`\n[${Math.floor((Date.now() - startTime) / 1000)}s] Status: ${status.data.status}`);
          
          if (status.data.resolver) {
            console.log("Resolver:", status.data.resolver);
          }
          if (status.data.srcEscrowAddress) {
            console.log("Source Escrow:", status.data.srcEscrowAddress);
            
            // Check on-chain order update
            const updatedOrder = await relayerContract.getOrder(orderId);
            console.log("Funds Transferred:", updatedOrder.fundsTransferred);
          }
          
          lastStatus = status.data.status;
        }
        
        if (status.data.status === "completed" || status.data.status === "failed") {
          break;
        }
      } catch (error) {
        console.error("Status check error:", error.message);
      }
    }
    
    // 8. Check final balances
    console.log("\n8️⃣ Final balances:");
    const [finalSrcBalance, finalDstBalance] = await Promise.all([
      srcToken.balanceOf(userWallet.address),
      dstToken.balanceOf(userWallet.address)
    ]);
    
    console.log("Base Sepolia USDT:", ethers.formatUnits(finalSrcBalance, 6));
    console.log("Arbitrum Sepolia DAI:", ethers.formatUnits(finalDstBalance, 6));
    
  } catch (error: any) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

// Start resolver service if not running
async function ensureResolverRunning() {
  console.log("\n🤖 Starting resolver service...");
  const { spawn } = await import("child_process");
  
  const resolver = spawn("npm", ["run", "start:integrated"], {
    cwd: __dirname,
    env: { ...process.env, RELAYER_URL },
    detached: false
  });
  
  resolver.stdout?.on("data", (data) => {
    console.log(`[Resolver] ${data}`);
  });
  
  resolver.stderr?.on("data", (data) => {
    console.error(`[Resolver Error] ${data}`);
  });
  
  // Give it time to start
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  return resolver;
}

// Main execution
async function main() {
  console.log("🎯 ACTUAL IMPLEMENTATION TEST (No Mocks!)");
  console.log("This test uses real contracts and actual functionality\n");
  
  // Start resolver if needed
  const resolverProcess = await ensureResolverRunning();
  
  try {
    await testActualImplementation();
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    // Clean up
    if (resolverProcess) {
      resolverProcess.kill();
    }
  }
}

// Run test
main().catch(console.error);