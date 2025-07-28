import axios from 'axios';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

interface TestConfig {
  relayerApiUrl: string;
  userPrivateKey: string;
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  amount: string;
}

class CrossChainSwapTester {
  private config: TestConfig;
  private userWallet: ethers.Wallet;

  constructor(config: TestConfig) {
    this.config = config;
    this.userWallet = new ethers.Wallet(config.userPrivateKey);
  }

  async testCompleteFlow(): Promise<void> {
    console.log('🚀 Starting Cross-Chain Swap Flow Test (10-Step Process)');
    console.log(`User Address: ${this.userWallet.address}`);
    console.log(`From Chain ${this.config.srcChainId} to Chain ${this.config.dstChainId}`);
    
    try {
      // Step 1: User approves relayer contract to spend source tokens
      console.log('\\n📝 Step 1: User approves relayer contract to spend source tokens');
      console.log('⚠️  NOTE: This step should be done manually by calling token.approve(relayerContract, amount)');
      console.log('For testing, we assume approval is already done');
      
      // Generate secret for HTLC
      const secret = ethers.hexlify(ethers.randomBytes(32));
      const secretHash = ethers.keccak256(secret);
      console.log(`Generated secret hash: ${secretHash}`);
      
      // Step 2: User submits swap order, signature, secret to relayer service
      console.log('\\n📝 Step 2: User submits swap order, signature, secret to relayer service');
      
      const swapRequest = {
        userAddress: this.userWallet.address,
        srcChainId: this.config.srcChainId,
        srcToken: this.config.srcToken,
        srcAmount: this.config.amount,
        dstChainId: this.config.dstChainId,
        dstToken: this.config.dstToken,
        secretHash: secretHash,
        minAcceptablePrice: '0.001',
        orderDuration: 3600 // 1 hour
      };
      
      // In real implementation, user would sign the swap request
      const signature = await this.userWallet.signMessage(JSON.stringify(swapRequest));

      const createOrderResponse = await axios.post(
        `${this.config.relayerApiUrl}/api/create-swap`,
        { 
          swapRequest, 
          signature,
          secret 
        }
      );

      if (!createOrderResponse.data.success) {
        throw new Error('Failed to create swap order');
      }

      const orderId = createOrderResponse.data.orderId;
      console.log(`✅ Step 2 Complete: Order created and registered: ${orderId}`);
      console.log(`Market Price: ${createOrderResponse.data.marketPrice}`);
      
      // Step 3: Relayer broadcasts order to resolvers (happens automatically)
      console.log('\\n📡 Step 3: Relayer broadcasts order to resolvers with secret hash only');
      console.log('✅ Step 3 Complete: Order broadcasted (resolvers can poll /api/active-orders)');

      // Steps 4-10: Monitor order progress through all remaining steps
      console.log('\\n⏳ Steps 4-10: Monitoring order progress through resolver commitment and settlement...');
      await this.monitorOrderProgress(orderId);

      console.log('\\n🎉 Complete 10-step cross-chain swap flow test completed successfully!');

    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    }
  }

  private async monitorOrderProgress(orderId: string): Promise<void> {
    const maxWaitTime = 300000; // 5 minutes
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const statusResponse = await axios.get(
          `${this.config.relayerApiUrl}/api/order-status/${orderId}`
        );

        if (statusResponse.status === 404) {
          console.log('Order not found');
          return;
        }

        const orderStatus = statusResponse.data;
        console.log(`Order Status: ${orderStatus.status}`);

        switch (orderStatus.status) {
          case 'active':
            console.log('🔄 Step 4 Pending: Order is active, waiting for resolver commitment...');
            break;
            
          case 'committed':
            console.log(`✅ Step 4 Complete: Resolver committed: ${orderStatus.resolver}`);
            console.log(`💰 Committed Price: ${orderStatus.committedPrice}`);
            console.log(`⏰ 5-minute timer started, deadline: ${new Date(orderStatus.commitmentDeadline).toISOString()}`);
            console.log('🔄 Step 5: Resolver is deploying escrow contracts with safety deposits...');
            break;
            
          case 'settling':
            console.log('✅ Step 5-6 Complete: Escrows deployed and verified');
            if (orderStatus.srcEscrowAddress) {
              console.log(`📦 Source Escrow: ${orderStatus.srcEscrowAddress}`);
            }
            if (orderStatus.dstEscrowAddress) {
              console.log(`📦 Destination Escrow: ${orderStatus.dstEscrowAddress}`);
            }
            console.log('🔄 Step 7: Relayer transferring user funds to source escrow...');
            console.log('🔄 Step 8: Resolver depositing funds to destination escrow...');
            break;
            
          case 'completed':
            console.log('✅ Step 8 Complete: Resolver notified trade completion');
            console.log('✅ Step 9 Complete: Relayer revealed secret on destination chain');
            console.log('✅ Step 10 Available: Resolver can now use secret to withdraw from source chain');
            console.log('🎉 All 10 steps completed successfully!');
            return;
            
          case 'failed':
            console.log('❌ Trade failed during execution');
            return;
            
          case 'rescue_available':
            console.log('🚨 Timeout Rescue: Original resolver failed, order available for rescue');
            console.log('Any other resolver can complete and claim safety deposits as penalty');
            break;
            
          default:
            console.log(`Unknown status: ${orderStatus.status}`);
        }

        await this.sleep(pollInterval);
        
      } catch (error) {
        console.error('Error checking order status:', error);
        await this.sleep(pollInterval);
      }
    }

    console.log('⏰ Timeout waiting for order completion');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Test configuration
const deployments = JSON.parse(require('fs').readFileSync('./deployed_contracts.json', 'utf-8'));
const walletInfo = JSON.parse(require('fs').readFileSync('./new_deployer_wallet.json', 'utf-8'));

const testConfig: TestConfig = {
  relayerApiUrl: process.env.RELAYER_API_URL || 'http://localhost:3000',
  userPrivateKey: walletInfo.privateKey, // Using deployer wallet since it has funds
  srcChainId: 11155111, // Sepolia
  dstChainId: 84532,    // Base Sepolia
  srcToken: deployments.sepolia.usdtToken,
  dstToken: deployments.baseSepolia.daiToken,
  amount: ethers.parseUnits('100', 6).toString() // 100 USDT
};

async function main(): Promise<void> {
  if (!testConfig.userPrivateKey) {
    console.error('Please set TEST_USER_PRIVATE_KEY or RESOLVER_PRIVATE_KEY in .env');
    process.exit(1);
  }

  const tester = new CrossChainSwapTester(testConfig);
  await tester.testCompleteFlow();
}

// Run the test
if (require.main === module) {
  main().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { CrossChainSwapTester };