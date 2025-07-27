const axios = require('axios');
const ethers = require('ethers');
require('dotenv').config();

const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:3000";

async function createTestSwap() {
  try {
    console.log(`[Test] Creating test swap auction...`);
    
    // Generate a secret and its hash
    const secret = ethers.keccak256(ethers.toUtf8Bytes("test_secret_123"));
    const secretHash = ethers.keccak256(secret);
    
    const swapRequest = {
      userAddress: "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35",
      srcChainId: 84532, // Base Sepolia
      srcToken: "0x2024B9fe781106c3966130e0Fa26a15FbA52a91C", // USDT on Base
      srcAmount: "10000000", // 10 USDT (6 decimals)
      dstChainId: 421614, // Arbitrum Sepolia  
      dstToken: "0x694273F2FaE10d36D552086Ce3c6172a8707eF43", // DAI on Arbitrum
      startPrice: "11000000", // 11 DAI for 10 USDT ($1.10)
      endPrice: "9000000",   // 9 DAI for 10 USDT ($0.90)
      auctionDuration: 300,  // 5 minutes
      secretHash: secretHash
    };
    
    console.log(`[Test] Swap details:`);
    console.log(`  From: ${ethers.formatUnits(swapRequest.srcAmount, 6)} USDT on Base`);
    console.log(`  To: ${ethers.formatUnits(swapRequest.startPrice, 6)} DAI on Arbitrum`);
    console.log(`  Secret: ${secret}`);
    console.log(`  Secret Hash: ${secretHash}`);
    
    const response = await axios.post(`${RELAYER_URL}/api/create-swap`, {
      swapRequest,
      secret
    });
    
    if (response.data.success) {
      console.log(`[Test] ✅ Auction created!`);
      console.log(`  Auction ID: ${response.data.auction.auctionId}`);
      console.log(`  Status: ${response.data.auction.status}`);
      
      // Monitor auction status
      const auctionId = response.data.auction.auctionId;
      await monitorAuction(auctionId);
    } else {
      console.log(`[Test] ❌ Failed to create auction:`, response.data);
    }
    
  } catch (error) {
    console.error(`[Test] Error:`, error.response?.data || error.message);
  }
}

async function monitorAuction(auctionId) {
  console.log(`[Test] Monitoring auction ${auctionId.slice(0, 10)}...`);
  
  for (let i = 0; i < 30; i++) { // Monitor for 30 iterations (1.5 minutes)
    try {
      const response = await axios.get(`${RELAYER_URL}/api/auction-status/${auctionId}`);
      const auction = response.data;
      
      console.log(`[Test] Auction status: ${auction.status}`);
      
      if (auction.status === "completed") {
        console.log(`[Test] ✅ Auction completed successfully!`);
        console.log(`  Resolver: ${auction.resolver}`);
        console.log(`  Src Escrow: ${auction.srcEscrowAddress}`);
        console.log(`  Dst Escrow: ${auction.dstEscrowAddress}`);
        break;
      } else if (auction.status === "failed") {
        console.log(`[Test] ❌ Auction failed`);
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`[Test] Error checking status:`, error.message);
    }
  }
}

createTestSwap().catch(console.error);