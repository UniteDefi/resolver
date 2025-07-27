import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:3000";
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;

// Chain configs
const chains = {
  baseSepolia: {
    chainId: 84532,
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    tokens: {
      USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // Base Sepolia USDT
      DAI: "0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9"   // Base Sepolia DAI
    }
  },
  arbitrumSepolia: {
    chainId: 421614,
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    tokens: {
      USDT: "0xf3c3351D6Bd0098EEb7C6E0f7D26B4874D89a4DB", // Arbitrum Sepolia USDT
      DAI: "0xc34aeFEa232956542C5b2f2EE55fD5c378B35c03"   // Arbitrum Sepolia DAI
    }
  }
};

// ERC20 ABI
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function testCompleteFlow() {
  console.log("🚀 Starting Cross-Chain Swap Test (Base Sepolia USDT -> Arbitrum Sepolia DAI)");
  
  // Step 1: Setup wallets
  const baseProvider = new ethers.JsonRpcProvider(chains.baseSepolia.rpcUrl);
  const arbitrumProvider = new ethers.JsonRpcProvider(chains.arbitrumSepolia.rpcUrl);
  
  const userWalletBase = new ethers.Wallet(USER_PRIVATE_KEY, baseProvider);
  const userWalletArbitrum = new ethers.Wallet(USER_PRIVATE_KEY, arbitrumProvider);
  
  console.log("👤 User address:", userWalletBase.address);
  
  // Step 2: Check balances
  const srcToken = new ethers.Contract(chains.baseSepolia.tokens.USDT, ERC20_ABI, userWalletBase);
  const dstToken = new ethers.Contract(chains.arbitrumSepolia.tokens.DAI, ERC20_ABI, userWalletArbitrum);
  
  const srcBalance = await srcToken.balanceOf(userWalletBase.address);
  const dstBalanceBefore = await dstToken.balanceOf(userWalletBase.address);
  
  console.log("💰 Source balance:", ethers.formatUnits(srcBalance, 6), "USDT");
  console.log("💰 Destination balance before:", ethers.formatUnits(dstBalanceBefore, 6), "DAI");
  
  if (srcBalance === 0n) {
    console.error("❌ No USDT balance on Base Sepolia. Please fund your wallet.");
    return;
  }
  
  // Step 3: Get relayer contract address
  console.log("\n📡 Getting relayer contract address...");
  const healthResponse = await axios.get(`${RELAYER_URL}/health`);
  console.log("✅ Relayer service is healthy");
  
  // For now, use a mock relayer contract address
  // In production, this would be fetched from the relayer service
  const RELAYER_CONTRACT = "0x" + "1".repeat(40);
  
  // Step 4: Approve relayer contract
  const swapAmount = ethers.parseUnits("10", 6); // 10 USDT
  console.log(`\n✍️ Approving relayer contract to spend ${ethers.formatUnits(swapAmount, 6)} USDT...`);
  
  const currentAllowance = await srcToken.allowance(userWalletBase.address, RELAYER_CONTRACT);
  if (currentAllowance < swapAmount) {
    const approveTx = await srcToken.approve(RELAYER_CONTRACT, swapAmount);
    console.log("📝 Approval tx:", approveTx.hash);
    await approveTx.wait();
    console.log("✅ Approval confirmed");
  } else {
    console.log("✅ Already approved");
  }
  
  // Step 5: Generate secret and hash
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  
  console.log("\n🔐 Generated secret hash:", secretHash);
  
  // Step 6: Create swap request
  const swapRequest = {
    userAddress: userWalletBase.address,
    signature: "0x", // Simplified for demo
    srcChainId: chains.baseSepolia.chainId,
    srcToken: chains.baseSepolia.tokens.USDT,
    srcAmount: swapAmount.toString(),
    dstChainId: chains.arbitrumSepolia.chainId,
    dstToken: chains.arbitrumSepolia.tokens.DAI,
    secretHash: secretHash,
    minAcceptablePrice: ethers.parseUnits("9.5", 6).toString(), // Accept 9.5 DAI minimum
    orderDuration: 300 // 5 minutes
  };
  
  console.log("\n📤 Creating swap order...");
  
  try {
    const createResponse = await axios.post(`${RELAYER_URL}/api/create-swap`, {
      swapRequest,
      secret: ethers.hexlify(secret)
    });
    
    console.log("✅ Order created!");
    console.log("🆔 Order ID:", createResponse.data.orderId);
    console.log("💱 Market price:", ethers.formatUnits(createResponse.data.marketPrice, 6), "DAI");
    
    // Step 7: Monitor order status
    console.log("\n⏳ Monitoring order status...");
    const orderId = createResponse.data.orderId;
    
    let orderComplete = false;
    let lastStatus = "";
    
    while (!orderComplete) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
      
      try {
        const statusResponse = await axios.get(`${RELAYER_URL}/api/order-status/${orderId}`);
        const status = statusResponse.data;
        
        if (status.status !== lastStatus) {
          console.log(`📊 Order status: ${status.status}`);
          
          if (status.resolver) {
            console.log(`🤝 Resolver committed: ${status.resolver}`);
          }
          
          if (status.userFundsMoved) {
            console.log("💸 User funds moved to escrow");
          }
          
          lastStatus = status.status;
        }
        
        if (status.status === "completed") {
          orderComplete = true;
          console.log("\n🎉 Swap completed successfully!");
        } else if (status.status === "failed") {
          orderComplete = true;
          console.log("\n❌ Swap failed");
        }
      } catch (error) {
        console.error("Error checking status:", error);
      }
    }
    
    // Step 8: Check final balances
    console.log("\n📊 Checking final balances...");
    const srcBalanceAfter = await srcToken.balanceOf(userWalletBase.address);
    const dstBalanceAfter = await dstToken.balanceOf(userWalletBase.address);
    
    console.log("💰 Source balance after:", ethers.formatUnits(srcBalanceAfter, 6), "USDT");
    console.log("💰 Destination balance after:", ethers.formatUnits(dstBalanceAfter, 6), "DAI");
    
    const srcSpent = srcBalance - srcBalanceAfter;
    const dstReceived = dstBalanceAfter - dstBalanceBefore;
    
    if (srcSpent > 0n && dstReceived > 0n) {
      console.log("\n✅ Swap successful!");
      console.log(`📉 Spent: ${ethers.formatUnits(srcSpent, 6)} USDT`);
      console.log(`📈 Received: ${ethers.formatUnits(dstReceived, 6)} DAI`);
      console.log(`💹 Exchange rate: 1 USDT = ${Number(dstReceived) / Number(srcSpent)} DAI`);
    }
    
  } catch (error: any) {
    console.error("\n❌ Error:", error.response?.data || error.message);
  }
}

// Run the test
testCompleteFlow().catch(console.error);