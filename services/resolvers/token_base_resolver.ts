import { ethers } from "ethers";
import { Logger } from "../common/logger";
import { CHAINS } from "../common/config";

const TOKEN_AUCTION_ABI = [
  "event AuctionCreated(bytes32 indexed auctionId, address indexed seller, address indexed token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 duration)",
  "event AuctionSettled(bytes32 indexed auctionId, address indexed buyer, uint256 price, uint256 amount, uint256 totalCost)",
  "event AuctionCancelled(bytes32 indexed auctionId)",
  "function getCurrentPrice(bytes32 auctionId) external view returns (uint256)",
  "function settleAuction(bytes32 auctionId) external payable",
  "function getAuction(bytes32 auctionId) external view returns (address seller, address token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 duration, bool isActive)"
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

export interface TokenAuctionInfo {
  auctionId: string;
  seller: string;
  token: string;
  amount: bigint;
  startPrice: bigint;
  endPrice: bigint;
  startTime: number;
  duration: number;
}

export interface TokenResolverConfig {
  id: string;
  privateKey: string;
  chain: string;
  auctionContract: string;
  maxPricePerToken: {
    usdt: string; // Max ETH per USDT
    link: string; // Max ETH per LINK
  };
  minEthBalance: string;
  competitionDelayMs: number;
}

export class TokenBaseResolver {
  protected logger: Logger;
  protected provider: ethers.Provider;
  protected wallet: ethers.Wallet;
  protected auctionContract: ethers.Contract;
  protected activeAuctions: Map<string, TokenAuctionInfo> = new Map();
  protected processingAuctions: Set<string> = new Set();
  protected tokenCache: Map<string, { symbol: string; decimals: number }> = new Map();

  constructor(protected config: TokenResolverConfig) {
    this.logger = new Logger(`TokenResolver-${config.id}`);
    this.wallet = new ethers.Wallet(config.privateKey);
    
    const chainConfig = CHAINS[config.chain as keyof typeof CHAINS];
    if (!chainConfig) {
      throw new Error(`Unknown chain: ${config.chain}`);
    }
    
    this.provider = new ethers.JsonRpcProvider(chainConfig.rpc);
    const signer = this.wallet.connect(this.provider);
    
    this.auctionContract = new ethers.Contract(
      config.auctionContract,
      TOKEN_AUCTION_ABI,
      signer
    );
    
    this.logger.log(`Initialized on ${config.chain}`);
    this.logger.log(`Auction contract: ${config.auctionContract}`);
  }

  async start() {
    this.logger.log("Starting token resolver service...");
    
    // Check ETH balance
    await this.checkBalance();
    
    // Start listening for auctions
    this.listenForAuctions();
    
    // Monitor active auctions
    setInterval(() => this.monitorAuctions(), 2000);
    
    this.logger.success("Token resolver service started!");
    this.logger.log("🎧 Listening for new token auctions...");
  }

  private async checkBalance() {
    const balance = await this.provider.getBalance(this.wallet.address);
    this.logger.log(`ETH balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther(this.config.minEthBalance)) {
      this.logger.warn("⚠️ Low ETH balance!");
    }
  }

  private listenForAuctions() {
    this.auctionContract.on(
      "AuctionCreated",
      async (
        auctionId: string,
        seller: string,
        token: string,
        amount: bigint,
        startPrice: bigint,
        endPrice: bigint,
        duration: bigint,
        event: any
      ) => {
        const block = await event.getBlock();
        const auctionInfo: TokenAuctionInfo = {
          auctionId,
          seller,
          token,
          amount,
          startPrice,
          endPrice,
          startTime: block.timestamp,
          duration: Number(duration),
        };

        // Get token info
        const tokenInfo = await this.getTokenInfo(token);
        
        this.logger.log(`📢 New ${tokenInfo.symbol} auction detected:`, {
          auctionId: auctionId.slice(0, 10) + "...",
          amount: ethers.formatUnits(amount, tokenInfo.decimals) + " " + tokenInfo.symbol,
          startPrice: ethers.formatEther(startPrice) + " ETH per " + tokenInfo.symbol,
          endPrice: ethers.formatEther(endPrice) + " ETH per " + tokenInfo.symbol,
          duration: Number(duration) + "s",
        });

        this.activeAuctions.set(auctionId, auctionInfo);
        
        // Evaluate immediately
        await this.evaluateAuction(auctionInfo);
      }
    );

    this.auctionContract.on(
      "AuctionSettled",
      (auctionId: string, buyer: string, price: bigint, amount: bigint, totalCost: bigint) => {
        const wasOurs = buyer.toLowerCase() === this.wallet.address.toLowerCase();
        
        if (wasOurs) {
          this.logger.success(`🎉 We won the auction! Total cost: ${ethers.formatEther(totalCost)} ETH`);
        } else if (this.activeAuctions.has(auctionId)) {
          this.logger.log(`Auction won by ${buyer.slice(0, 6)}...${buyer.slice(-4)}`);
        }
        
        this.activeAuctions.delete(auctionId);
        this.processingAuctions.delete(auctionId);
      }
    );

    this.auctionContract.on("AuctionCancelled", (auctionId: string) => {
      if (this.activeAuctions.has(auctionId)) {
        this.logger.log(`Auction cancelled: ${auctionId.slice(0, 10)}...`);
        this.activeAuctions.delete(auctionId);
        this.processingAuctions.delete(auctionId);
      }
    });
  }

  private async getTokenInfo(tokenAddress: string): Promise<{ symbol: string; decimals: number }> {
    if (this.tokenCache.has(tokenAddress)) {
      return this.tokenCache.get(tokenAddress)!;
    }
    
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const [symbol, decimals] = await Promise.all([
      tokenContract.symbol(),
      tokenContract.decimals(),
    ]);
    
    const info = { symbol: symbol.toLowerCase(), decimals };
    this.tokenCache.set(tokenAddress, info);
    return info;
  }

  private async monitorAuctions() {
    for (const [auctionId, auction] of this.activeAuctions) {
      if (!this.processingAuctions.has(auctionId)) {
        await this.evaluateAuction(auction);
      }
    }
  }

  private async evaluateAuction(auction: TokenAuctionInfo) {
    try {
      // Get current price per token
      const currentPrice = await this.auctionContract.getCurrentPrice(auction.auctionId);
      const tokenInfo = await this.getTokenInfo(auction.token);
      
      // Calculate total cost
      const totalCost = (currentPrice * auction.amount) / ethers.parseEther("1");
      
      // Get max acceptable price for this token
      const maxPrice = ethers.parseEther(
        this.config.maxPricePerToken[tokenInfo.symbol as keyof typeof this.config.maxPricePerToken] || "0"
      );
      
      this.logger.log(`💭 Evaluating ${tokenInfo.symbol} auction:`, {
        currentPrice: ethers.formatEther(currentPrice) + " ETH per " + tokenInfo.symbol,
        totalCost: ethers.formatEther(totalCost) + " ETH",
        maxAcceptable: ethers.formatEther(maxPrice) + " ETH per " + tokenInfo.symbol,
      });

      // Check if price is acceptable
      if (currentPrice <= maxPrice) {
        // Add competition delay
        const delay = Math.random() * this.config.competitionDelayMs;
        this.logger.log(`⏳ Good price! Waiting ${delay.toFixed(0)}ms before attempting...`);
        
        this.processingAuctions.add(auction.auctionId);
        setTimeout(() => this.attemptSettle(auction, totalCost), delay);
      }
    } catch (error: any) {
      this.logger.error("Failed to evaluate auction:", error.message);
    }
  }

  private async attemptSettle(auction: TokenAuctionInfo, expectedCost: bigint) {
    try {
      // Check if auction is still active
      const auctionData = await this.auctionContract.getAuction(auction.auctionId);
      if (!auctionData.isActive) {
        this.logger.warn("Auction no longer active");
        return;
      }

      // Recalculate current price
      const currentPrice = await this.auctionContract.getCurrentPrice(auction.auctionId);
      const totalCost = (currentPrice * auction.amount) / ethers.parseEther("1");
      
      const tokenInfo = await this.getTokenInfo(auction.token);
      
      this.logger.log(
        `🎯 Attempting to settle ${tokenInfo.symbol} auction at ${ethers.formatEther(totalCost)} ETH`
      );

      // Send transaction with 5% buffer
      const tx = await this.auctionContract.settleAuction(auction.auctionId, {
        value: (totalCost * 105n) / 100n,
      });

      this.logger.log(`📤 Settlement TX sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      this.logger.success(`✅ Auction settled! Gas used: ${receipt.gasUsed}`);
    } catch (error: any) {
      if (error.message?.includes("AuctionNotActive")) {
        this.logger.warn("Someone else won the auction");
      } else {
        this.logger.error("Failed to settle auction:", error.message);
      }
    } finally {
      this.processingAuctions.delete(auction.auctionId);
    }
  }

  async stop() {
    this.logger.log("Stopping token resolver service...");
    await this.auctionContract.removeAllListeners();
    this.logger.log("Token resolver service stopped.");
  }
}