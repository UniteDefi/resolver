#!/usr/bin/env ts-node

import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

dotenv.config();

// Configuration
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY || process.env.TEST_USER_PRIVATE_KEY!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;

// Chain configs
const chains = {
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    tokens: {
      USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
      DAI: "0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9"
    }
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    tokens: {
      USDT: "0xf3c3351D6Bd0098EEb7C6E0f7D26B4874D89a4DB",
      DAI: "0xc34aeFEa232956542C5b2f2EE55fD5c378B35c03"
    }
  }
};

// ERC20 ABI
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

class CrossChainSwapTest {
  private relayerProcess: any;
  private resolverProcess: any;
  private relayerUrl = "http://localhost:3000";
  
  async setup() {
    console.log("🔧 Setting up test environment...\n");
    
    // Check if services are already running
    try {
      const health = await axios.get(`${this.relayerUrl}/health`);
      console.log("✅ Relayer service already running");
    } catch (error) {
      console.log("🚀 Starting relayer service...");
      // Start relayer service
      this.relayerProcess = spawn("npm", ["run", "dev"], {
        cwd: path.join(__dirname, "../../relayer"),
        detached: false,
        stdio: "pipe"
      });
      
      // Wait for relayer to start
      await this.waitForService(this.relayerUrl, "Relayer");
    }
    
    console.log("🚀 Starting resolver service...");
    // Start resolver service
    this.resolverProcess = spawn("npm", ["run", "start:integrated"], {
      cwd: path.join(__dirname, ".."),
      detached: false,
      stdio: "pipe",
      env: { ...process.env, RELAYER_URL: this.relayerUrl }
    });
    
    // Give resolver time to connect
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log("✅ Services are running\n");
  }
  
  async waitForService(url: string, name: string, maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await axios.get(`${url}/health`);
        console.log(`✅ ${name} service is ready`);
        return;
      } catch (error) {
        process.stdout.write(".");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`${name} service failed to start`);
  }
  
  async runTest() {
    console.log("🧪 Running Cross-Chain Swap Test\n");
    console.log("📍 Route: Base Sepolia USDT → Arbitrum Sepolia DAI\n");
    
    // Setup wallets
    const baseProvider = new ethers.JsonRpcProvider(chains.baseSepolia.rpcUrl);
    const arbitrumProvider = new ethers.JsonRpcProvider(chains.arbitrumSepolia.rpcUrl);
    
    const userWalletBase = new ethers.Wallet(USER_PRIVATE_KEY, baseProvider);
    const userWalletArbitrum = new ethers.Wallet(USER_PRIVATE_KEY, arbitrumProvider);
    
    console.log("👤 User address:", userWalletBase.address);
    
    // Check balances
    const srcToken = new ethers.Contract(chains.baseSepolia.tokens.USDT, ERC20_ABI, userWalletBase);
    const dstToken = new ethers.Contract(chains.arbitrumSepolia.tokens.DAI, ERC20_ABI, userWalletArbitrum);
    
    const srcBalance = await srcToken.balanceOf(userWalletBase.address);
    const dstBalanceBefore = await dstToken.balanceOf(userWalletBase.address);
    
    console.log("💰 Base Sepolia USDT balance:", ethers.formatUnits(srcBalance, 6));
    console.log("💰 Arbitrum Sepolia DAI balance:", ethers.formatUnits(dstBalanceBefore, 6));
    
    if (srcBalance === 0n) {
      console.error("\n❌ No USDT balance on Base Sepolia.");
      console.log("💡 Get test USDT from: https://docs.base.org/tools/network-faucets");
      return;
    }
    
    // Get relayer contract address
    let relayerContract: string;
    try {
      const deployments = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../mock_relayer_deployments.json"), "utf8")
      );
      relayerContract = deployments.baseSepolia.relayerContract;
      console.log("\n📜 Relayer contract:", relayerContract);
    } catch (error) {
      console.log("\n⚠️ Using mock relayer contract address");
      relayerContract = "0x" + "1".repeat(40);
    }
    
    // Approve relayer contract
    const swapAmount = ethers.parseUnits("10", 6); // 10 USDT
    console.log(`\n✍️ Approving ${ethers.formatUnits(swapAmount, 6)} USDT to relayer...`);
    
    const currentAllowance = await srcToken.allowance(userWalletBase.address, relayerContract);
    if (currentAllowance < swapAmount) {
      const approveTx = await srcToken.approve(relayerContract, swapAmount);
      console.log("📝 Approval tx:", approveTx.hash);
      await approveTx.wait();
      console.log("✅ Approval confirmed");
    } else {
      console.log("✅ Already approved");
    }
    
    // Generate secret
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(secret);
    console.log("\n🔐 Secret hash:", secretHash);
    
    // Create swap order
    const swapRequest = {
      userAddress: userWalletBase.address,
      signature: "0x", // Simplified for demo
      srcChainId: chains.baseSepolia.chainId,
      srcToken: chains.baseSepolia.tokens.USDT,
      srcAmount: swapAmount.toString(),
      dstChainId: chains.arbitrumSepolia.chainId,
      dstToken: chains.arbitrumSepolia.tokens.DAI,
      secretHash: secretHash,
      minAcceptablePrice: ethers.parseUnits("9.5", 6).toString(),
      orderDuration: 300
    };
    
    console.log("\n📤 Creating swap order...");
    
    try {
      const createResponse = await axios.post(`${this.relayerUrl}/api/create-swap`, {
        swapRequest,
        secret: ethers.hexlify(secret)
      });
      
      console.log("✅ Order created!");
      console.log("🆔 Order ID:", createResponse.data.orderId.slice(0, 10) + "...");
      console.log("💱 Market price:", ethers.formatUnits(createResponse.data.marketPrice, 6), "DAI");
      
      // Monitor order
      console.log("\n⏳ Monitoring order progress...\n");
      const orderId = createResponse.data.orderId;
      
      const startTime = Date.now();
      let lastStatus = "";
      let orderComplete = false;
      
      while (!orderComplete && (Date.now() - startTime) < 300000) { // 5 min timeout
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
          const statusResponse = await axios.get(`${this.relayerUrl}/api/order-status/${orderId}`);
          const status = statusResponse.data;
          
          if (status.status !== lastStatus) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            console.log(`[${elapsed}s] Status: ${status.status}`);
            
            if (status.resolver) {
              console.log(`      → Resolver committed: ${status.resolver.slice(0, 10)}...`);
            }
            
            if (status.srcEscrowAddress) {
              console.log(`      → Source escrow: ${status.srcEscrowAddress.slice(0, 10)}...`);
            }
            
            if (status.dstEscrowAddress) {
              console.log(`      → Destination escrow: ${status.dstEscrowAddress.slice(0, 10)}...`);
            }
            
            if (status.userFundsMoved) {
              console.log("      → User funds moved to escrow ✓");
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
        } catch (error: any) {
          console.error("Error checking status:", error.message);
        }
      }
      
      if (!orderComplete) {
        console.log("\n⏰ Test timed out");
      }
      
      // Check final balances
      console.log("\n📊 Final Balances:");
      const srcBalanceAfter = await srcToken.balanceOf(userWalletBase.address);
      const dstBalanceAfter = await dstToken.balanceOf(userWalletBase.address);
      
      console.log("💰 Base Sepolia USDT:", ethers.formatUnits(srcBalanceAfter, 6));
      console.log("💰 Arbitrum Sepolia DAI:", ethers.formatUnits(dstBalanceAfter, 6));
      
      const srcSpent = srcBalance - srcBalanceAfter;
      const dstReceived = dstBalanceAfter - dstBalanceBefore;
      
      if (srcSpent > 0n && dstReceived > 0n) {
        console.log("\n✅ Swap Summary:");
        console.log(`📉 Sent: ${ethers.formatUnits(srcSpent, 6)} USDT`);
        console.log(`📈 Received: ${ethers.formatUnits(dstReceived, 6)} DAI`);
        const rate = Number(dstReceived) / Number(srcSpent);
        console.log(`💹 Rate: 1 USDT = ${rate.toFixed(4)} DAI`);
      }
      
    } catch (error: any) {
      console.error("\n❌ Test failed:", error.response?.data || error.message);
    }
  }
  
  async cleanup() {
    console.log("\n🧹 Cleaning up...");
    
    if (this.resolverProcess) {
      this.resolverProcess.kill();
      console.log("✅ Resolver stopped");
    }
    
    // Don't kill relayer if it was already running
    if (this.relayerProcess) {
      this.relayerProcess.kill();
      console.log("✅ Relayer stopped");
    }
  }
}

// Main test runner
async function main() {
  const test = new CrossChainSwapTest();
  
  try {
    await test.setup();
    await test.runTest();
  } catch (error: any) {
    console.error("\n❌ Test error:", error.message);
  } finally {
    await test.cleanup();
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n⚠️ Test interrupted");
  process.exit(0);
});

// Run test
main().catch(console.error);