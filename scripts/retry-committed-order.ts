import axios from 'axios';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function retryCommittedOrder() {
  const orderId = process.argv[2];
  const resolverIndex = parseInt(process.argv[3] || '1');
  
  if (!orderId) {
    console.error('Usage: ts-node retry-committed-order.ts <orderId> [resolverIndex]');
    process.exit(1);
  }
  
  console.log(`Retrying order ${orderId} with resolver ${resolverIndex}`);
  
  // Get resolver private key
  const privateKey = process.env[`RESOLVER_PRIVATE_KEY_${resolverIndex}`];
  if (!privateKey) {
    console.error(`RESOLVER_PRIVATE_KEY_${resolverIndex} not found`);
    process.exit(1);
  }
  
  const wallet = new ethers.Wallet(privateKey);
  console.log(`Using resolver address: ${wallet.address}`);
  
  // Get order details from relayer
  const relayerUrl = process.env.RELAYER_URL || 'http://localhost:3000';
  
  try {
    // First check order status
    const statusResponse = await axios.get(`${relayerUrl}/api/order-status/${orderId}`);
    console.log('Order status:', statusResponse.data);
    
    if (statusResponse.data.status !== 'committed') {
      console.error('Order is not in committed status');
      return;
    }
    
    // Simulate the resolver picking up the order again
    // This would normally happen through SQS, but we'll do it directly
    console.log('Manually triggering escrow deployment...');
    
    // Get the full order data (you might need to implement this endpoint)
    // For now, we'll just log what we need to do
    console.log('TODO: Implement manual escrow deployment trigger');
    console.log('This would require:');
    console.log('1. Recreating the order with SDK/testnet helper');
    console.log('2. Deploying escrows on both chains');
    console.log('3. Notifying the relayer');
    
  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
  }
}

retryCommittedOrder().catch(console.error);