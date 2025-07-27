const axios = require('axios');
const ethers = require('ethers');
require('dotenv').config();

const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:3000";
const CHECK_INTERVAL = 3000;
const MIN_PROFIT_USD = 0.1;

console.log(`[Integrated Resolver] Starting...`);
console.log(`[Integrated Resolver] Relayer URL: ${RELAYER_URL}`);
console.log(`[Integrated Resolver] Min profit: $${MIN_PROFIT_USD}`);

const wallet = new ethers.Wallet(process.env.RESOLVER1_WALLET_PRIVATE_KEY);
console.log(`[Integrated Resolver] Address: ${wallet.address}`);

let isRunning = true;

async function checkAuctions() {
  try {
    const response = await axios.get(`${RELAYER_URL}/api/active-auctions`);
    const auctions = response.data;
    
    console.log(`[Integrated Resolver] Found ${auctions.length} active auctions`);
    
    for (const auction of auctions) {
      await evaluateAuction(auction);
    }
  } catch (error) {
    console.error(`[Integrated Resolver] Error:`, error.message);
  }
}

async function evaluateAuction(auction) {
  const srcAmount = Number(ethers.formatUnits(auction.srcAmount, 6));
  const dstAmount = Number(ethers.formatUnits(auction.currentPrice, 6));
  const profit = srcAmount - dstAmount;
  
  console.log(`[Integrated Resolver] Auction ${auction.auctionId.slice(0, 10)}...`);
  console.log(`  Selling: ${srcAmount} USDT ($${srcAmount})`);
  console.log(`  Buying: ${dstAmount} DAI ($${dstAmount})`);
  console.log(`  Profit: $${profit.toFixed(2)}`);
  
  if (profit >= MIN_PROFIT_USD) {
    console.log(`[Integrated Resolver] ✅ Profitable! Filling...`);
    await fillAuction(auction);
  }
}

async function fillAuction(auction) {
  try {
    // Commit to auction
    const commitment = {
      auctionId: auction.auctionId,
      resolverAddress: wallet.address,
      srcEscrowAddress: "0x" + "1".repeat(40),
      dstEscrowAddress: "0x" + "2".repeat(40),
      srcSafetyDepositTx: "0x" + "a".repeat(64),
      dstSafetyDepositTx: "0x" + "b".repeat(64),
      committedPrice: auction.currentPrice,
      timestamp: Date.now()
    };
    
    const commitResponse = await axios.post(`${RELAYER_URL}/api/commit-resolver`, commitment);
    
    if (commitResponse.data.success) {
      console.log(`[Integrated Resolver] ✅ Committed!`);
      
      // Move user funds
      await axios.post(`${RELAYER_URL}/api/move-user-funds`, {
        auctionId: auction.auctionId,
        resolverAddress: wallet.address
      });
      
      console.log(`[Integrated Resolver] User funds moved`);
      
      // Notify completion
      await axios.post(`${RELAYER_URL}/api/notify-completion`, {
        auctionId: auction.auctionId,
        resolverAddress: wallet.address,
        dstTokenAmount: auction.currentPrice,
        dstTxHash: "0x" + "c".repeat(64)
      });
      
      console.log(`[Integrated Resolver] ✅ Settlement complete!`);
    }
  } catch (error) {
    console.error(`[Integrated Resolver] Error filling:`, error.response?.data || error.message);
  }
}

async function monitor() {
  while (isRunning) {
    await checkAuctions();
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }
}

process.on('SIGINT', () => {
  console.log('\n[Integrated Resolver] Shutting down...');
  isRunning = false;
  process.exit(0);
});

monitor().catch(console.error);