import { ethers } from 'ethers';
import axios from 'axios';
import dotenv from 'dotenv';
import { createTestnetCrossChainOrder } from './utils/testnet-cross-chain-order';

dotenv.config();

interface CommittedOrder {
  orderId: string;
  resolver: string;
  committedPrice: string;
  commitmentDeadline: number;
}

const CHAIN_CONFIGS = {
  11155111: { name: 'Ethereum Sepolia', rpc: process.env.ETH_SEPOLIA_RPC_URL },
  84532: { name: 'Base Sepolia', rpc: process.env.BASE_SEPOLIA_RPC_URL },
  421614: { name: 'Arbitrum Sepolia', rpc: process.env.ARB_SEPOLIA_RPC_URL },
  10143: { name: 'Monad Testnet', rpc: process.env.MONAD_TESTNET_RPC_URL }
};

const DEPLOYMENTS = {
  11155111: {
    limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
    escrowFactory: '0xc5268765e591e303e97fb0aec139cbb764b96df2'
  },
  84532: {
    limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65', 
    escrowFactory: '0x82aaa15a37fd115e11246a2d5d732629af15e9d1'
  },
  421614: {
    limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
    escrowFactory: '0x3722cc2778acdf236a8066b7fad7a5dcdb1cc7c1'
  },
  10143: {
    limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
    escrowFactory: '0x9883a9330d1b0dab45c9747d57ca8bd2c532549e'
  }
};

async function checkCommittedOrders() {
  const relayerUrl = process.env.RELAYER_URL || 'http://localhost:3000';
  const resolverIndex = parseInt(process.env.RESOLVER_INDEX || '1');
  const privateKey = process.env[`RESOLVER_PRIVATE_KEY_${resolverIndex}`];
  
  if (!privateKey) {
    console.error(`RESOLVER_PRIVATE_KEY_${resolverIndex} not found`);
    return;
  }
  
  const wallet = new ethers.Wallet(privateKey);
  console.log(`[Retry Service] Checking committed orders for resolver ${wallet.address}`);
  
  try {
    // Get all active orders
    const response = await axios.get(`${relayerUrl}/api/active-orders`);
    const orders = response.data;
    
    // Filter for committed orders by this resolver
    const committedOrders = [];
    
    for (const order of orders) {
      try {
        const statusResponse = await axios.get(`${relayerUrl}/api/order-status/${order.orderId}`);
        if (statusResponse.data.status === 'committed' && 
            statusResponse.data.resolver === wallet.address) {
          committedOrders.push({
            ...order,
            ...statusResponse.data
          });
        }
      } catch (error) {
        // Order might not exist in status endpoint
      }
    }
    
    if (committedOrders.length === 0) {
      console.log('[Retry Service] No committed orders found for this resolver');
      return;
    }
    
    console.log(`[Retry Service] Found ${committedOrders.length} committed orders to retry`);
    
    for (const order of committedOrders) {
      console.log(`[Retry Service] Retrying order ${order.orderId}`);
      
      try {
        // Create providers
        const srcProvider = new ethers.JsonRpcProvider(CHAIN_CONFIGS[order.srcChainId].rpc);
        const dstProvider = new ethers.JsonRpcProvider(CHAIN_CONFIGS[order.dstChainId].rpc);
        
        // Connect wallet to chains
        const srcWallet = wallet.connect(srcProvider);
        const dstWallet = wallet.connect(dstProvider);
        
        // Get resolver addresses (these would come from your config)
        const resolverAddresses = getResolverAddresses(resolverIndex);
        const srcResolverAddress = resolverAddresses[order.srcChainId];
        const dstResolverAddress = resolverAddresses[order.dstChainId];
        
        // Recreate the order with testnet helper
        const orderParams = {
          escrowFactory: DEPLOYMENTS[order.srcChainId].escrowFactory,
          limitOrderProtocol: DEPLOYMENTS[order.srcChainId].limitOrderProtocol,
          salt: BigInt(order.orderId),
          maker: order.userAddress,
          makingAmount: BigInt(order.srcAmount),
          takingAmount: BigInt(order.srcAmount), // Will be adjusted by price
          makerAsset: order.srcToken,
          takerAsset: order.dstToken,
          srcChainId: order.srcChainId,
          dstChainId: order.dstChainId,
          hashLock: order.secretHash,
          timeLocks: {
            srcWithdrawal: 300n,
            srcPublicWithdrawal: 600n,
            srcCancellation: 900n,
            srcPublicCancellation: 1200n,
            dstWithdrawal: 300n,
            dstPublicWithdrawal: 600n,
            dstCancellation: 900n
          },
          srcSafetyDeposit: BigInt(order.srcAmount) / 20n, // 5%
          dstSafetyDeposit: BigInt(order.srcAmount) / 20n,
          auctionDetails: {
            initialRateBump: 2000, // 2%
            duration: BigInt(order.auctionDuration || 60),
            startTime: BigInt(Math.floor(Date.now() / 1000))
          },
          whitelist: [
            { address: srcResolverAddress, allowFrom: 0n },
            { address: dstResolverAddress, allowFrom: 0n }
          ],
          resolvingStartTime: BigInt(Math.floor(Date.now() / 1000)),
          nonce: 0n,
          allowPartialFills: false,
          allowMultipleFills: false
        };
        
        const testnetOrder = createTestnetCrossChainOrder(
          orderParams.escrowFactory,
          orderParams.limitOrderProtocol,
          {
            salt: orderParams.salt,
            maker: orderParams.maker,
            makingAmount: orderParams.makingAmount,
            takingAmount: orderParams.takingAmount,
            makerAsset: orderParams.makerAsset,
            takerAsset: orderParams.takerAsset
          },
          {
            hashLock: orderParams.hashLock,
            timeLocks: orderParams.timeLocks,
            srcChainId: orderParams.srcChainId,
            dstChainId: orderParams.dstChainId,
            srcSafetyDeposit: orderParams.srcSafetyDeposit,
            dstSafetyDeposit: orderParams.dstSafetyDeposit
          },
          {
            auction: orderParams.auctionDetails,
            whitelist: orderParams.whitelist,
            resolvingStartTime: orderParams.resolvingStartTime
          },
          {
            nonce: orderParams.nonce,
            allowPartialFills: orderParams.allowPartialFills,
            allowMultipleFills: orderParams.allowMultipleFills
          }
        );
        
        console.log(`[Retry Service] Order recreated, deploying escrows...`);
        
        // Deploy escrows (simplified - you'd need the full deployment logic)
        // This would involve calling the resolver contract's `deployEscrow` method
        
        console.log(`[Retry Service] TODO: Implement escrow deployment for order ${order.orderId}`);
        
      } catch (error: any) {
        console.error(`[Retry Service] Failed to retry order ${order.orderId}:`, error.message);
      }
    }
    
  } catch (error: any) {
    console.error('[Retry Service] Error checking orders:', error.message);
  }
}

function getResolverAddresses(resolverIndex: number): Record<number, string> {
  // These are hardcoded based on your deployment
  const resolverAddresses = [
    { // Resolver 0
      11155111: '0x8fb4a80bacabe982ec1382ec9f032a53df0d88dd',
      84532: '0x7d76c0d417310e5c0dd8a81fb5a651a7de3cd670',
      421614: '0x3ca6e8712e4aeaaee1c0c74e21cc5299ac40475d',
      10143: '0x5e9517b4b790117e67d569472d8ccb83aa4426e4'
    },
    { // Resolver 1
      11155111: '0xcc14100211626d4d6fc8751fb62c16a7d5be502f',
      84532: '0xbd2e176ed6b17802f139d3c4bb5557d5c0ef8f50',
      421614: '0x0361d3c7c5c1f236f507453086cde18d12dd76e3',
      10143: '0xf6bbcf06ceb067fbb9a97fb2d04004acb442bb92'
    },
    { // Resolver 2
      11155111: '0x4888dc936f9b9e398fd3b63ab2a6906f5caec795',
      84532: '0x0b6fb370e9323ce7e97e2f2e7572f7ee24d51deb',
      421614: '0x81cc67ed241c9ed3142a45eff844957de2b37877',
      10143: '0x63f7888a08526b725b7274b9318034d87c8283b7'
    },
    { // Resolver 3
      11155111: '0x7dac24e18114010de3b17a59dd2000df646cc8a6',
      84532: '0x891ca74824a64fc59a4c4d77fdd97908ec3c99ed',
      421614: '0x3096ca722e2343664f5cead66e1a8bdf763dd8c2',
      10143: '0x10568cf1240cb275eb406bf5c6a38a416c557306'
    }
  ];
  
  return resolverAddresses[resolverIndex];
}

// Run every 30 seconds
async function startRetryService() {
  console.log('[Retry Service] Starting committed order retry service...');
  
  // Check immediately
  await checkCommittedOrders();
  
  // Then check every 30 seconds
  setInterval(async () => {
    await checkCommittedOrders();
  }, 30000);
}

// Start the service
startRetryService().catch(console.error);