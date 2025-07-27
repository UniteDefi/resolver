import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function checkAuctionState() {
  console.log("\n🔍 Checking Auction State...\n");

  // Load deployments
  const auctionDeployments = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "auction_deployments.json"), "utf8")
  );

  // Setup provider
  const provider = new ethers.JsonRpcProvider(
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Load ABI
  const auctionAbi = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "dist/contracts/CrossChainTokenAuction.sol/CrossChainTokenAuction.json"), "utf8")
  ).abi;

  // Contract instance
  const auctionContract = new ethers.Contract(auctionDeployments.base_sepolia.crossChainTokenAuction, auctionAbi, provider);

  // The auction ID from previous transaction
  const auctionId = "0x9b60204b3bf4a6f9231fc7459ef2776be9063a6bcb0862314fff2ac9c5b0b12d";
  
  console.log(`Checking auction: ${auctionId.slice(0, 10)}...`);
  
  try {
    // Get auction details
    const auction = await auctionContract.auctions(auctionId);
    console.log("\nAuction Details:");
    console.log(`  Seller: ${auction.seller}`);
    console.log(`  Active: ${auction.active}`);
    console.log(`  Src Token: ${auction.srcToken}`);
    console.log(`  Src Amount: ${ethers.formatUnits(auction.srcAmount, 18)} LINK`);
    console.log(`  Start Price: ${ethers.formatUnits(auction.startPrice, 6)} USDT`);
    console.log(`  End Price: ${ethers.formatUnits(auction.endPrice, 6)} USDT`);
    console.log(`  Hashlock: ${auction.hashlock.slice(0, 20)}...`);
    
    // Check resolver
    const resolver = await auctionContract.resolvers(auctionId);
    console.log(`\nResolver who filled: ${resolver}`);
    
    // Check if secret was revealed
    const secret = await auctionContract.secrets(auctionId);
    console.log(`Secret revealed: ${secret !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? "Yes" : "No"}`);
    if (secret !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(`Secret: ${secret.slice(0, 20)}...`);
    }
    
    // Get current price
    if (auction.active) {
      const currentPrice = await auctionContract.getCurrentPrice(auctionId);
      console.log(`\nCurrent Price: ${ethers.formatUnits(currentPrice, 6)} USDT`);
    }
    
  } catch (error) {
    console.error("Error checking auction state:", error);
  }
}

checkAuctionState().catch(console.error);