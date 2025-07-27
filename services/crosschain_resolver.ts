import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  contracts: {
    mockUSDT: string;
    mockLINK: string;
    auctionContract: string;
  };
}

export class CrossChainResolver {
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private contracts: Map<string, any> = new Map();
  private wallet: ethers.Wallet;
  private name: string;
  private watchedAuctions: Set<string> = new Set();
  private priceThreshold: number; // Max percentage of start price to pay

  constructor(
    privateKey: string,
    name: string,
    priceThreshold: number = 0.9 // Will pay up to 90% of start price
  ) {
    this.wallet = new ethers.Wallet(privateKey);
    this.name = name;
    this.priceThreshold = priceThreshold;
  }

  async initialize() {
    console.log(`[${this.name}] Initializing cross-chain resolver...`);
    
    // Load deployments
    const deployments = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "crosschain_deployments.json"), "utf8")
    );

    // Load contract ABIs
    const auctionAbi = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "dist/contracts/CrossChainTokenAuction.sol/CrossChainTokenAuction.json"),
        "utf8"
      )
    ).abi;

    const tokenAbi = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "dist/contracts/MockToken.sol/MockToken.json"),
        "utf8"
      )
    ).abi;

    // Setup providers and contracts for each chain
    for (const [chainKey, deployment] of Object.entries(deployments)) {
      const chainInfo = deployment as any;
      const rpcUrl = chainKey === "ethereum_sepolia" 
        ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        : `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = this.wallet.connect(provider);
      
      this.providers.set(chainKey, provider);
      
      // Create contract instances
      const auctionContract = new ethers.Contract(
        chainInfo.auctionContract,
        auctionAbi,
        signer
      );
      
      const usdtContract = new ethers.Contract(
        chainInfo.mockUSDT,
        tokenAbi,
        signer
      );
      
      const linkContract = new ethers.Contract(
        chainInfo.mockLINK,
        tokenAbi,
        signer
      );

      this.contracts.set(`${chainKey}_auction`, auctionContract);
      this.contracts.set(`${chainKey}_usdt`, usdtContract);
      this.contracts.set(`${chainKey}_link`, linkContract);

      console.log(`[${this.name}] Connected to ${chainKey}`);
    }
  }

  async start() {
    console.log(`[${this.name}] Starting cross-chain monitoring...`);
    
    // Monitor both chains for new auctions
    const ethAuction = this.contracts.get("ethereum_sepolia_auction");
    const baseAuction = this.contracts.get("base_sepolia_auction");

    // Listen for auctions on Ethereum
    ethAuction.on("CrossChainAuctionCreated", async (
      auctionId: string,
      seller: string,
      srcChainId: bigint,
      srcToken: string,
      srcAmount: bigint,
      destChainId: bigint,
      destToken: string,
      startPrice: bigint,
      endPrice: bigint,
      hashlock: string
    ) => {
      console.log(`\n[${this.name}] 🔔 New auction detected on Ethereum!`);
      console.log(`  Auction ID: ${auctionId.slice(0, 10)}...`);
      console.log(`  Selling: ${ethers.formatEther(srcAmount)} tokens`);
      console.log(`  From Chain: ${srcChainId} → To Chain: ${destChainId}`);
      console.log(`  Price Range: ${ethers.formatUnits(startPrice, 6)} → ${ethers.formatUnits(endPrice, 6)} USDT`);
      
      if (!this.watchedAuctions.has(auctionId)) {
        this.watchedAuctions.add(auctionId);
        this.monitorAndFillAuction(auctionId, "ethereum_sepolia", Number(destChainId));
      }
    });

    // Listen for auctions on Base
    baseAuction.on("CrossChainAuctionCreated", async (
      auctionId: string,
      seller: string,
      srcChainId: bigint,
      srcToken: string,
      srcAmount: bigint,
      destChainId: bigint,
      destToken: string,
      startPrice: bigint,
      endPrice: bigint,
      hashlock: string
    ) => {
      console.log(`\n[${this.name}] 🔔 New auction detected on Base!`);
      console.log(`  Auction ID: ${auctionId.slice(0, 10)}...`);
      console.log(`  Selling: ${ethers.formatUnits(srcAmount, 18)} tokens`);
      console.log(`  From Chain: ${srcChainId} → To Chain: ${destChainId}`);
      console.log(`  Price Range: ${ethers.formatEther(startPrice)} → ${ethers.formatEther(endPrice)} tokens`);
      
      if (!this.watchedAuctions.has(auctionId)) {
        this.watchedAuctions.add(auctionId);
        this.monitorAndFillAuction(auctionId, "base_sepolia", Number(destChainId));
      }
    });

    console.log(`[${this.name}] 👂 Listening for cross-chain auctions...`);
  }

  private async monitorAndFillAuction(
    auctionId: string,
    srcChain: string,
    destChainId: number
  ) {
    const destChain = destChainId === 11155111 ? "ethereum_sepolia" : "base_sepolia";
    const srcAuctionContract = this.contracts.get(`${srcChain}_auction`);
    const destAuctionContract = this.contracts.get(`${destChain}_auction`);

    // Get auction details
    const auction = await srcAuctionContract.getAuction(auctionId);
    const startPrice = auction[6]; // startPrice from getAuction return
    
    console.log(`[${this.name}] Monitoring auction ${auctionId.slice(0, 10)}...`);
    
    // Price monitoring loop
    const checkInterval = setInterval(async () => {
      try {
        const currentPrice = await srcAuctionContract.getCurrentPrice(auctionId);
        const priceRatio = Number(currentPrice) / Number(startPrice);
        
        console.log(`[${this.name}] Current price: ${ethers.formatUnits(currentPrice, 6)}, Ratio: ${(priceRatio * 100).toFixed(1)}%`);
        
        // Check if price is good enough
        if (priceRatio <= this.priceThreshold) {
          console.log(`[${this.name}] 💰 Price threshold reached! Attempting to fill...`);
          
          // Fill on destination chain
          await this.fillAuction(auctionId, destChain, auction);
          clearInterval(checkInterval);
        }
        
        // Check if auction is still active
        const isActive = auction[7];
        if (!isActive) {
          console.log(`[${this.name}] Auction no longer active`);
          clearInterval(checkInterval);
        }
      } catch (error) {
        console.error(`[${this.name}] Error monitoring auction:`, error);
        clearInterval(checkInterval);
      }
    }, 3000); // Check every 3 seconds
  }

  private async fillAuction(auctionId: string, destChain: string, auctionDetails: any) {
    try {
      const destAuctionContract = this.contracts.get(`${destChain}_auction`);
      const destToken = auctionDetails[4]; // destToken address
      const currentPrice = auctionDetails[6]; // current price
      
      // Get the correct token contract
      const tokenType = destToken.toLowerCase().includes("usdt") ? "usdt" : "link";
      const destTokenContract = this.contracts.get(`${destChain}_${tokenType}`);
      
      console.log(`[${this.name}] Approving ${ethers.formatUnits(currentPrice, 6)} tokens...`);
      
      // Approve tokens
      const approveTx = await destTokenContract.approve(
        destAuctionContract.target,
        currentPrice
      );
      await approveTx.wait();
      
      console.log(`[${this.name}] Filling auction on ${destChain}...`);
      
      // Fill the auction
      const fillTx = await destAuctionContract.fillAuction(auctionId);
      const receipt = await fillTx.wait();
      
      console.log(`[${this.name}] ✅ Auction filled! TX: ${fillTx.hash}`);
      console.log(`[${this.name}] Waiting for seller to reveal secret...`);
      
      // Listen for secret reveal
      destAuctionContract.once("AuctionRevealed", async (revealedAuctionId: string, secret: string) => {
        if (revealedAuctionId === auctionId) {
          console.log(`[${this.name}] 🔓 Secret revealed! Claiming tokens on source chain...`);
          
          // Switch to source chain to claim
          const srcChain = auctionDetails[3] === 11155111 ? "ethereum_sepolia" : "base_sepolia";
          const srcAuctionContract = this.contracts.get(`${srcChain}_auction`);
          
          const claimTx = await srcAuctionContract.claimWithSecret(auctionId, secret);
          await claimTx.wait();
          
          console.log(`[${this.name}] 🎉 Cross-chain swap complete! Claimed tokens on ${srcChain}`);
        }
      });
      
    } catch (error) {
      console.error(`[${this.name}] Error filling auction:`, error);
    }
  }

  async getBalances() {
    const balances: any = {};
    
    for (const chain of ["ethereum_sepolia", "base_sepolia"]) {
      const provider = this.providers.get(chain)!;
      const usdtContract = this.contracts.get(`${chain}_usdt`);
      const linkContract = this.contracts.get(`${chain}_link`);
      
      const ethBalance = await provider.getBalance(this.wallet.address);
      const usdtBalance = await usdtContract.balanceOf(this.wallet.address);
      const linkBalance = await linkContract.balanceOf(this.wallet.address);
      
      balances[chain] = {
        ETH: ethers.formatEther(ethBalance),
        USDT: ethers.formatUnits(usdtBalance, 6),
        LINK: ethers.formatEther(linkBalance)
      };
    }
    
    return balances;
  }
}