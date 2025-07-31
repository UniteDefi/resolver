#!/usr/bin/env ts-node

import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

async function testSwap() {
  const privateKey = process.env.USER_PRIVATE_KEY;
  if (!privateKey) throw new Error('USER_PRIVATE_KEY not found');
  
  const wallet = new ethers.Wallet(privateKey);
  const relayerUrl = 'http://localhost:3000';
  
  console.log('Testing minimal swap...');
  console.log('User:', wallet.address);
  
  // Generate secret
  const secret = Math.random().toString(36).substring(2, 15);
  const secretBytes32 = ethers.utils.formatBytes32String(secret);
  const secretHash = ethers.utils.keccak256(secretBytes32);
  
  console.log('Secret:', secret);
  console.log('Secret Hash:', secretHash);
  
  // Create swap request
  const swapRequest = {
    userAddress: wallet.address,
    signature: '', // Will be filled later
    srcChainId: 11155111, // eth_sepolia
    srcToken: '0x8465d8d2c0a3228ddbfa8b0c495cd14d2dbee8ac', // USDT
    srcAmount: '100000000', // 100 USDT (6 decimals)
    dstChainId: 84532, // base_sepolia
    dstToken: '0xcc14100211626d4d6fc8751fb62c16a7d5be502f', // USDT
    secretHash: secretHash,
    minAcceptablePrice: '95000000', // 95 USDT
    orderDuration: 300 // 5 minutes
  };
  
  try {
    // Get typed data from relayer
    console.log('\n1. Getting typed data from relayer...');
    const typedDataRes = await axios.post(`${relayerUrl}/api/get-typed-data`, { swapRequest });
    const { typedData, htlcOrder, orderId } = typedDataRes.data;
    
    console.log('Order ID:', orderId);
    console.log('Domain:', JSON.stringify(typedData.domain, null, 2));
    console.log('HTLC Order:', JSON.stringify(htlcOrder, null, 2));
    
    // Fix the verifying contract if it's wrong
    if (typedData.domain.verifyingContract === '0x1234567890123456789012345678901234567890') {
      console.log('\\nWARNING: Relayer returned placeholder verifying contract!');
      typedData.domain.verifyingContract = '0xc5268765e591e303e97fb0aec139cbb764b96df2';
      console.log('Fixed to:', typedData.domain.verifyingContract);
    }
    
    // Sign with ethers v5
    console.log('\n2. Signing order...');
    const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const connectedWallet = wallet.connect(provider);
    
    const signature = await connectedWallet._signTypedData(
      typedData.domain,
      { HTLCOrder: typedData.types.HTLCOrder },
      htlcOrder
    );
    
    console.log('Signature:', signature);
    
    // Submit to relayer
    console.log('\n3. Submitting to relayer...');
    const submitRes = await axios.post(`${relayerUrl}/api/create-swap`, {
      htlcOrder,
      signature,
      secret
    });
    
    console.log('Success!', submitRes.data);
    
  } catch (error: any) {
    if (error.response) {
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testSwap().catch(console.error);