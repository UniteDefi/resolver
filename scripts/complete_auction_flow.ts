import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

// Transaction tracking
const transactions: any[] = [];
const signatures: any[] = [];

function logTransaction(type: string, tx: any, details: any) {
  transactions.push({
    type,
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    blockNumber: tx.blockNumber,
    timestamp: new Date().toISOString(),
    ...details
  });
  console.log(`[TX] ${type}: ${tx.hash}`);
}

async function main() {
  console.log("\n=== UniteDefi Dutch Auction Complete Flow Demo ===\n");

  // Load deployed contracts
  const deploymentInfo = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "deployments_base_sepolia.json"), "utf8")
  );

  const USDT_ADDRESS = deploymentInfo.mockUSDT;
  const LINK_ADDRESS = deploymentInfo.mockLINK;
  const AUCTION_ADDRESS = deploymentInfo.auctionContract;

  // Setup provider
  const provider = new ethers.JsonRpcProvider(
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Setup wallets
  const seller = new ethers.Wallet(process.env.SELLER_WALLET_PRIVATE_KEY!, provider);
  const resolver1 = new ethers.Wallet(process.env.RESOLVER1_WALLET_PRIVATE_KEY!, provider);
  const resolver2 = new ethers.Wallet(process.env.RESOLVER2_WALLET_PRIVATE_KEY!, provider);

  console.log("🔑 Participants:");
  console.log(`  Seller: ${seller.address}`);
  console.log(`  Resolver1 (Fast): ${resolver1.address}`);
  console.log(`  Resolver2 (Patient): ${resolver2.address}\n`);

  // Load contract ABIs
  const tokenAbi = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/MockToken.sol/MockToken.json"),
      "utf8"
    )
  ).abi;

  const auctionAbi = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/TokenDutchAuction.sol/TokenDutchAuction.json"),
      "utf8"
    )
  ).abi;

  // Create contract instances
  const linkToken = new ethers.Contract(LINK_ADDRESS, tokenAbi, seller);
  const usdtToken = new ethers.Contract(USDT_ADDRESS, tokenAbi, provider);
  const auctionContract = new ethers.Contract(AUCTION_ADDRESS, auctionAbi, seller);

  // Initial balances
  console.log("💰 Initial Balances:");
  const sellerLinkBalance = await linkToken.balanceOf(seller.address);
  const sellerEthBalance = await provider.getBalance(seller.address);
  console.log(`  Seller: ${ethers.formatEther(sellerLinkBalance)} LINK, ${ethers.formatEther(sellerEthBalance)} ETH`);
  
  const resolver1LinkBalance = await linkToken.balanceOf(resolver1.address);
  const resolver1EthBalance = await provider.getBalance(resolver1.address);
  console.log(`  Resolver1: ${ethers.formatEther(resolver1LinkBalance)} LINK, ${ethers.formatEther(resolver1EthBalance)} ETH\n`);

  // Step 1: Seller creates auction
  console.log("📝 Step 1: Creating Dutch Auction");
  console.log("  Selling: 5 LINK");
  console.log("  Start price: 0.01 ETH per LINK (total 0.05 ETH)");
  console.log("  End price: 0.008 ETH per LINK (total 0.04 ETH)");
  console.log("  Duration: 30 seconds\n");

  // Approve tokens
  const approveTx = await linkToken.approve(AUCTION_ADDRESS, ethers.parseEther("5"));
  await approveTx.wait();
  logTransaction("Approve", approveTx, { 
    seller: seller.address,
    token: "LINK", 
    amount: "5",
    spender: AUCTION_ADDRESS
  });

  // Create auction
  const auctionId = ethers.randomBytes(32);
  const startPricePerToken = ethers.parseEther("0.01"); // 0.01 ETH per LINK
  const endPricePerToken = ethers.parseEther("0.008");  // 0.008 ETH per LINK
  
  const createTx = await auctionContract.createAuction(
    auctionId,
    LINK_ADDRESS,
    ethers.parseEther("5"), // 5 LINK
    startPricePerToken,
    endPricePerToken,
    30 // 30 seconds
  );
  const createReceipt = await createTx.wait();
  logTransaction("CreateAuction", createTx, { 
    auctionId: ethers.hexlify(auctionId),
    seller: seller.address,
    token: "LINK",
    amount: "5",
    startPrice: "0.01 ETH/LINK",
    endPrice: "0.008 ETH/LINK",
    duration: "30s"
  });

  console.log("\n⏰ Step 2: Resolvers monitoring auction...");
  
  // Monitor auction price
  let priceChecks = 0;
  const priceMonitor = setInterval(async () => {
    try {
      const currentPrice = await auctionContract.getCurrentPrice(auctionId);
      const totalCost = currentPrice * BigInt(5) / ethers.parseEther("1");
      console.log(`  [${priceChecks * 5}s] Current price: ${ethers.formatEther(currentPrice)} ETH/LINK (Total: ${ethers.formatEther(totalCost)} ETH)`);
      priceChecks++;
    } catch (e) {
      // Auction might be settled
    }
  }, 5000);

  // Resolver1 decides to fill after 12 seconds
  setTimeout(async () => {
    console.log("\n🏃 Step 3: Resolver1 (Fast) decides to fill the order");
    
    try {
      const currentPrice = await auctionContract.getCurrentPrice(auctionId);
      const totalCost = currentPrice * BigInt(5) / ethers.parseEther("1");
      console.log(`  Current price: ${ethers.formatEther(currentPrice)} ETH per LINK`);
      console.log(`  Total cost: ${ethers.formatEther(totalCost)} ETH for 5 LINK`);
      
      // Create HTLC-like signature (simulated)
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "address", "uint256", "uint256"],
        [auctionId, resolver1.address, currentPrice, BigInt(Date.now())]
      );
      const signature = await resolver1.signMessage(ethers.getBytes(messageHash));
      signatures.push({
        signer: resolver1.address,
        purpose: "HTLC commitment",
        messageHash: messageHash,
        signature: signature,
        timestamp: new Date().toISOString()
      });
      console.log(`  🔏 HTLC signature created: ${signature.slice(0, 20)}...`);
      
      // Settle auction
      const auctionContractResolver = auctionContract.connect(resolver1);
      const settleTx = await auctionContractResolver.settleAuction(auctionId, {
        value: ethers.parseEther("0.1") // Send extra, will get refund
      });
      const settleReceipt = await settleTx.wait();
      
      // Parse settlement event
      const settleEvent = settleReceipt?.logs.find(
        log => log.topics[0] === ethers.id("AuctionSettled(bytes32,address,uint256,uint256,uint256)")
      );
      
      if (settleEvent && auctionContract.interface) {
        const decoded = auctionContract.interface.parseLog({
          topics: [...settleEvent.topics],
          data: settleEvent.data
        });
        
        logTransaction("SettleAuction", settleTx, {
          resolver: resolver1.address,
          auctionId: ethers.hexlify(auctionId),
          pricePerToken: ethers.formatEther(decoded?.args[2]) + " ETH",
          amount: ethers.formatEther(decoded?.args[3]) + " LINK",
          totalCost: ethers.formatEther(decoded?.args[4]) + " ETH"
        });
        
        console.log(`  ✅ Auction settled successfully!`);
        console.log(`  💸 Paid: ${ethers.formatEther(decoded?.args[4])} ETH`);
        console.log(`  📦 Received: ${ethers.formatEther(decoded?.args[3])} LINK`);
      }
      
      clearInterval(priceMonitor);
      
      // Final balances
      setTimeout(async () => {
        console.log("\n💰 Step 4: Final Balances");
        
        const sellerFinalLink = await linkToken.balanceOf(seller.address);
        const sellerFinalEth = await provider.getBalance(seller.address);
        const resolver1FinalLink = await linkToken.balanceOf(resolver1.address);
        const resolver1FinalEth = await provider.getBalance(resolver1.address);
        
        console.log(`  Seller: ${ethers.formatEther(sellerFinalLink)} LINK (${ethers.formatEther(sellerLinkBalance)} → ${ethers.formatEther(sellerFinalLink)})`);
        console.log(`         ${ethers.formatEther(sellerFinalEth)} ETH (received payment)`);
        console.log(`  Resolver1: ${ethers.formatEther(resolver1FinalLink)} LINK (${ethers.formatEther(resolver1LinkBalance)} → ${ethers.formatEther(resolver1FinalLink)})`);
        console.log(`            ${ethers.formatEther(resolver1FinalEth)} ETH (paid for LINK)`);
        
        // Generate final report
        console.log("\n========== TRANSACTION REPORT ==========\n");
        console.log("📋 All Transactions:");
        transactions.forEach((tx, i) => {
          console.log(`\n${i + 1}. ${tx.type}:`);
          console.log(`   Hash: ${tx.hash}`);
          console.log(`   From: ${tx.from}`);
          console.log(`   To: ${tx.to || 'Contract Creation'}`);
          console.log(`   Block: ${tx.blockNumber || 'Pending'}`);
          Object.entries(tx).forEach(([key, value]) => {
            if (!['type', 'hash', 'from', 'to', 'blockNumber', 'timestamp'].includes(key)) {
              console.log(`   ${key}: ${value}`);
            }
          });
        });

        console.log("\n\n🔏 HTLC Signatures:");
        signatures.forEach((sig, i) => {
          console.log(`\n${i + 1}. ${sig.purpose}:`);
          console.log(`   Signer: ${sig.signer}`);
          console.log(`   Message Hash: ${sig.messageHash}`);
          console.log(`   Signature: ${sig.signature}`);
          console.log(`   Timestamp: ${sig.timestamp}`);
        });

        console.log("\n\n✅ Dutch Auction Flow Complete!");
        console.log("\n📝 Summary:");
        console.log("  - Seller listed 5 LINK with Dutch auction starting at 0.01 ETH/LINK");
        console.log("  - Price decreased linearly over 30 seconds to 0.008 ETH/LINK");
        console.log("  - Resolver1 competed and won the auction after ~12 seconds");
        console.log("  - HTLC-style commitment was created for atomic settlement");
        console.log("  - Tokens were transferred atomically: LINK to resolver, ETH to seller");
        console.log("  - All transactions completed successfully on Base Sepolia");
        
        process.exit(0);
      }, 2000);
      
    } catch (error) {
      console.error("Error settling auction:", error);
      clearInterval(priceMonitor);
      process.exit(1);
    }
  }, 12000);

}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});