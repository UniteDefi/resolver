const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY || PRIVATE_KEY;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const RELAYER_URL = "http://localhost:3000";

if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

// Chain configurations
const chains = {
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://base-sepolia.blockscout.com",
    tokens: {
      USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
      DAI: "0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9"
    }
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://arbitrum-sepolia.blockscout.com",
    tokens: {
      USDT: "0xf3c3351D6Bd0098EEb7C6E0f7D26B4874D89a4DB",
      DAI: "0xc34aeFEa232956542C5b2f2EE55fD5c378B35c03"
    }
  }
};

// Test report
const report = {
  startTime: new Date().toISOString(),
  transactions: [],
  apiCalls: [],
  orderDetails: {},
  errors: [],
  summary: {}
};

// ERC20 ABI
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function runCompleteTest() {
  console.log("🚀 CROSS-CHAIN SWAP COMPLETE TEST REPORT");
  console.log("=".repeat(60));
  console.log("Start Time:", report.startTime);
  console.log();
  
  try {
    // Check if services are running
    console.log("📡 Checking services...");
    
    try {
      const health = await axios.get(`${RELAYER_URL}/health`);
      console.log("✅ Relayer service is running");
      report.apiCalls.push({
        type: "HEALTH_CHECK",
        endpoint: "/health",
        response: health.data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("❌ Relayer service not running. Please start it first.");
      process.exit(1);
    }
    
    // Setup wallets
    const baseProvider = new ethers.JsonRpcProvider(chains.baseSepolia.rpcUrl);
    const arbitrumProvider = new ethers.JsonRpcProvider(chains.arbitrumSepolia.rpcUrl);
    
    const userWalletBase = new ethers.Wallet(USER_PRIVATE_KEY, baseProvider);
    const userWalletArbitrum = new ethers.Wallet(USER_PRIVATE_KEY, arbitrumProvider);
    
    console.log("\n👤 USER DETAILS:");
    console.log("Address:", userWalletBase.address);
    
    // Check balances
    const srcToken = new ethers.Contract(chains.baseSepolia.tokens.USDT, ERC20_ABI, userWalletBase);
    const dstToken = new ethers.Contract(chains.arbitrumSepolia.tokens.DAI, ERC20_ABI, userWalletArbitrum);
    
    const srcBalanceBefore = await srcToken.balanceOf(userWalletBase.address);
    const dstBalanceBefore = await dstToken.balanceOf(userWalletBase.address);
    
    console.log("\n💰 INITIAL BALANCES:");
    console.log("Base Sepolia USDT:", ethers.formatUnits(srcBalanceBefore, 6));
    console.log("Arbitrum Sepolia DAI:", ethers.formatUnits(dstBalanceBefore, 6));
    
    if (srcBalanceBefore == 0n) {
      console.error("\n❌ No USDT balance. Please fund the wallet first.");
      console.log("Wallet address:", userWalletBase.address);
      console.log("Get Base Sepolia ETH from: https://docs.base.org/tools/network-faucets");
      return;
    }
    
    // Use mock relayer address for now
    const RELAYER_CONTRACT = "0x1111111111111111111111111111111111111111";
    const swapAmount = ethers.parseUnits("10", 6); // 10 USDT
    
    console.log("\n📝 TRANSACTION 1: Token Approval");
    console.log("Approving", ethers.formatUnits(swapAmount, 6), "USDT to relayer contract...");
    console.log("Relayer Contract:", RELAYER_CONTRACT);
    
    const approveTx = await srcToken.approve(RELAYER_CONTRACT, swapAmount);
    console.log("TX Hash:", approveTx.hash);
    console.log("View on Blockscout:", `${chains.baseSepolia.blockExplorer}/tx/${approveTx.hash}`);
    
    report.transactions.push({
      type: "TOKEN_APPROVAL",
      chain: "Base Sepolia",
      hash: approveTx.hash,
      from: userWalletBase.address,
      to: chains.baseSepolia.tokens.USDT,
      data: {
        spender: RELAYER_CONTRACT,
        amount: swapAmount.toString()
      },
      blockExplorer: `${chains.baseSepolia.blockExplorer}/tx/${approveTx.hash}`
    });
    
    await approveTx.wait();
    console.log("✅ Approval confirmed");
    
    // Generate secret
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(secret);
    
    console.log("\n🔐 ORDER SECRET DETAILS:");
    console.log("Secret:", ethers.hexlify(secret));
    console.log("Secret Hash:", secretHash);
    
    report.orderDetails = {
      secret: ethers.hexlify(secret),
      secretHash: secretHash,
      swapAmount: ethers.formatUnits(swapAmount, 6) + " USDT",
      route: "Base Sepolia USDT → Arbitrum Sepolia DAI"
    };
    
    // Create swap order
    const swapRequest = {
      userAddress: userWalletBase.address,
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
    
    console.log("\n📤 API CALL 1: Create Swap Order");
    console.log("Endpoint: POST /api/create-swap");
    
    try {
      const createResponse = await axios.post(`${RELAYER_URL}/api/create-swap`, {
        swapRequest,
        secret: ethers.hexlify(secret)
      });
      
      console.log("Response:", JSON.stringify(createResponse.data, null, 2));
      
      report.apiCalls.push({
        type: "CREATE_SWAP",
        endpoint: "POST /api/create-swap",
        request: {
          userAddress: swapRequest.userAddress,
          srcAmount: ethers.formatUnits(swapRequest.srcAmount, 6) + " USDT",
          minAcceptablePrice: ethers.formatUnits(swapRequest.minAcceptablePrice, 6) + " DAI",
          secretHash: swapRequest.secretHash
        },
        response: createResponse.data,
        timestamp: new Date().toISOString()
      });
      
      const orderId = createResponse.data.orderId;
      report.orderDetails.orderId = orderId;
      report.orderDetails.marketPrice = ethers.formatUnits(createResponse.data.marketPrice || "0", 6) + " DAI";
      
      console.log("\n⏳ MONITORING ORDER STATUS");
      console.log("Order ID:", orderId);
      
      // Monitor order status
      const startTime = Date.now();
      let orderComplete = false;
      let statusChecks = 0;
      
      while (!orderComplete && (Date.now() - startTime) < 180000) { // 3 min timeout
        await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
        
        statusChecks++;
        const statusResponse = await axios.get(`${RELAYER_URL}/api/order-status/${orderId}`);
        const status = statusResponse.data;
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`\n[${elapsed}s] Status Check #${statusChecks}`);
        console.log("Status:", status.status || status);
        
        if (statusChecks === 1 || status.status !== report.orderDetails.lastStatus) {
          report.apiCalls.push({
            type: "ORDER_STATUS",
            endpoint: `GET /api/order-status/${orderId}`,
            response: status,
            timestamp: new Date().toISOString()
          });
        }
        
        if (status.resolver) {
          console.log("Resolver:", status.resolver);
          report.orderDetails.resolver = status.resolver;
        }
        
        if (status.srcEscrowAddress) {
          console.log("Source Escrow:", status.srcEscrowAddress);
          console.log("View:", `${chains.baseSepolia.blockExplorer}/address/${status.srcEscrowAddress}`);
          report.orderDetails.srcEscrow = status.srcEscrowAddress;
        }
        
        if (status.dstEscrowAddress) {
          console.log("Destination Escrow:", status.dstEscrowAddress);
          console.log("View:", `${chains.arbitrumSepolia.blockExplorer}/address/${status.dstEscrowAddress}`);
          report.orderDetails.dstEscrow = status.dstEscrowAddress;
        }
        
        if (status.userFundsMoved) {
          console.log("✅ User funds moved to escrow");
        }
        
        report.orderDetails.lastStatus = status.status;
        
        if (status.status === "completed" || status.status === "failed") {
          orderComplete = true;
          report.orderDetails.finalStatus = status.status;
        }
      }
      
      // Check final balances
      console.log("\n💰 FINAL BALANCES:");
      const srcBalanceAfter = await srcToken.balanceOf(userWalletBase.address);
      const dstBalanceAfter = await dstToken.balanceOf(userWalletBase.address);
      
      console.log("Base Sepolia USDT:", ethers.formatUnits(srcBalanceAfter, 6));
      console.log("Arbitrum Sepolia DAI:", ethers.formatUnits(dstBalanceAfter, 6));
      
      const srcSpent = srcBalanceBefore - srcBalanceAfter;
      const dstReceived = dstBalanceAfter - dstBalanceBefore;
      
      console.log("\n📊 SWAP SUMMARY:");
      console.log("USDT Spent:", ethers.formatUnits(srcSpent, 6));
      console.log("DAI Received:", ethers.formatUnits(dstReceived, 6));
      
      report.summary = {
        success: srcSpent > 0n && dstReceived > 0n,
        srcSpent: ethers.formatUnits(srcSpent, 6),
        dstReceived: ethers.formatUnits(dstReceived, 6),
        effectiveRate: srcSpent > 0n ? (Number(dstReceived) / Number(srcSpent)).toFixed(4) : "N/A"
      };
      
      if (report.summary.success) {
        console.log("Exchange Rate: 1 USDT =", report.summary.effectiveRate, "DAI");
        console.log("\n✅ SWAP COMPLETED SUCCESSFULLY!");
      } else {
        console.log("\n❌ SWAP FAILED OR INCOMPLETE");
      }
      
    } catch (error) {
      console.error("\n❌ Error:", error.response?.data || error.message);
      report.errors.push({
        step: "swap_execution",
        error: error.response?.data || error.message,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    report.errors.push({
      step: "test_setup",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
  
  // Generate final report
  console.log("\n" + "=".repeat(60));
  console.log("📋 COMPLETE TEST REPORT SUMMARY");
  console.log("=".repeat(60));
  
  console.log("\n1. TRANSACTIONS EXECUTED:");
  report.transactions.forEach((tx, i) => {
    console.log(`\n${i + 1}. ${tx.type}`);
    console.log(`   Chain: ${tx.chain}`);
    console.log(`   TX Hash: ${tx.hash}`);
    console.log(`   Explorer: ${tx.blockExplorer}`);
  });
  
  console.log("\n2. API CALLS MADE:");
  const apiSummary = {};
  report.apiCalls.forEach(call => {
    apiSummary[call.endpoint] = (apiSummary[call.endpoint] || 0) + 1;
  });
  Object.entries(apiSummary).forEach(([endpoint, count]) => {
    console.log(`   ${endpoint}: ${count} call(s)`);
  });
  
  console.log("\n3. ORDER DETAILS:");
  console.log(`   Order ID: ${report.orderDetails.orderId}`);
  console.log(`   Secret Hash: ${report.orderDetails.secretHash}`);
  console.log(`   Amount: ${report.orderDetails.swapAmount}`);
  console.log(`   Route: ${report.orderDetails.route}`);
  console.log(`   Market Price: ${report.orderDetails.marketPrice}`);
  console.log(`   Final Status: ${report.orderDetails.finalStatus}`);
  
  if (report.orderDetails.resolver) {
    console.log(`   Resolver: ${report.orderDetails.resolver}`);
  }
  
  if (report.orderDetails.srcEscrow) {
    console.log(`   Source Escrow: ${report.orderDetails.srcEscrow}`);
  }
  
  if (report.orderDetails.dstEscrow) {
    console.log(`   Dest Escrow: ${report.orderDetails.dstEscrow}`);
  }
  
  console.log("\n4. FINAL RESULT:");
  console.log(`   Success: ${report.summary.success ? "✅ YES" : "❌ NO"}`);
  if (report.summary.success) {
    console.log(`   USDT Sent: ${report.summary.srcSpent}`);
    console.log(`   DAI Received: ${report.summary.dstReceived}`);
    console.log(`   Rate: 1 USDT = ${report.summary.effectiveRate} DAI`);
  }
  
  if (report.errors.length > 0) {
    console.log("\n5. ERRORS:");
    report.errors.forEach(err => {
      console.log(`   - ${err.step}: ${err.error}`);
    });
  }
  
  // Save report
  report.endTime = new Date().toISOString();
  const reportPath = path.join(__dirname, `test_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved to: ${reportPath}`);
}

// Run the test
runCompleteTest().catch(console.error);