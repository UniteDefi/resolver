import { ethers } from "ethers";
import { Logger } from "../common/logger";
import { CHAINS } from "../common/config";

const TOKEN_AUCTION_ABI = [
  "event AuctionCreated(bytes32 indexed auctionId, address indexed seller, address indexed token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 duration)",
  "event AuctionSettled(bytes32 indexed auctionId, address indexed buyer, uint256 price, uint256 amount, uint256 totalCost)",
  "event AuctionCancelled(bytes32 indexed auctionId)",
  "function createAuction(bytes32 auctionId, address token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 duration) external",
  "function getCurrentPrice(bytes32 auctionId) external view returns (uint256)",
  "function settleAuction(bytes32 auctionId) external payable",
  "function getAuction(bytes32 auctionId) external view returns (address seller, address token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 duration, bool isActive)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

export interface TokenSellerConfig {
  privateKey: string;
  chain: string;
  auctionContract: string;
  tokenAddresses: {
    usdt: string;
    link: string;
  };
  auctionInterval: number;
}

export interface TokenAuctionScenario {
  name: string;
  token: "usdt" | "link";
  amount: string;
  startPriceEth: string;
  endPriceEth: string;
  duration: number;
}

const AUCTION_SCENARIOS: TokenAuctionScenario[] = [
  {
    name: "Quick USDT Sale",
    token: "usdt",
    amount: "1000", // 1000 USDT
    startPriceEth: "0.0004", // 0.0004 ETH per USDT (overpriced)
    endPriceEth: "0.00025", // 0.00025 ETH per USDT (fair price)
    duration: 60, // 1 minute
  },
  {
    name: "LINK Flash Sale",
    token: "link",
    amount: "10", // 10 LINK
    startPriceEth: "0.005", // 0.005 ETH per LINK (overpriced)
    endPriceEth: "0.002", // 0.002 ETH per LINK (fair price)
    duration: 90, // 1.5 minutes
  },
  {
    name: "Large USDT Auction",
    token: "usdt",
    amount: "5000", // 5000 USDT
    startPriceEth: "0.00035",
    endPriceEth: "0.00022",
    duration: 120, // 2 minutes
  },
  {
    name: "Small LINK Sale",
    token: "link",
    amount: "5", // 5 LINK
    startPriceEth: "0.004",
    endPriceEth: "0.0025",
    duration: 45, // 45 seconds
  },
];

export class TokenSellerService {
  private logger: Logger;
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private auctionContract: ethers.Contract;
  private tokenContracts: Map<string, ethers.Contract> = new Map();
  private auctionCounter = 0;
  private intervalId?: NodeJS.Timeout;
  private activeAuctions: Set<string> = new Set();

  constructor(private config: TokenSellerConfig) {
    this.logger = new Logger("TokenSeller");
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
    
    // Initialize token contracts
    this.tokenContracts.set(
      "usdt",
      new ethers.Contract(config.tokenAddresses.usdt, ERC20_ABI, signer)
    );
    this.tokenContracts.set(
      "link",
      new ethers.Contract(config.tokenAddresses.link, ERC20_ABI, signer)
    );
    
    this.logger.log(`Initialized on ${config.chain}`);
    this.logger.log(`Auction contract: ${config.auctionContract}`);
    this.logger.log(`USDT token: ${config.tokenAddresses.usdt}`);
    this.logger.log(`LINK token: ${config.tokenAddresses.link}`);
  }

  async start() {
    this.logger.log("Starting token seller service...");
    
    // Check token balances
    await this.checkBalances();
    
    // Listen for auction events
    this.listenForEvents();
    
    // Create initial auction after a delay to ensure resolvers are ready
    setTimeout(() => this.createRandomAuction(), 5000);
    
    // Schedule periodic auctions
    this.intervalId = setInterval(
      () => this.createRandomAuction(),
      this.config.auctionInterval
    );
    
    this.logger.success("Token seller service started!");
    this.logger.log("Listening for auction events...");
  }

  private async checkBalances() {
    this.logger.log("Checking token balances...");
    
    const ethBalance = await this.provider.getBalance(this.wallet.address);
    this.logger.log(`ETH balance: ${ethers.formatEther(ethBalance)} ETH`);
    
    for (const [tokenName, contract] of this.tokenContracts) {
      const balance = await contract.balanceOf(this.wallet.address);
      const decimals = await contract.decimals();
      const symbol = await contract.symbol();
      
      this.logger.log(
        `${symbol} balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`
      );
    }
  }

  private listenForEvents() {
    this.auctionContract.on(
      "AuctionCreated",
      (auctionId, seller, token, amount, startPrice, endPrice, duration) => {
        if (seller.toLowerCase() === this.wallet.address.toLowerCase()) {
          this.logger.success(`Auction created: ${auctionId.slice(0, 10)}...`);
          this.activeAuctions.add(auctionId);
        }
      }
    );

    this.auctionContract.on(
      "AuctionSettled",
      (auctionId, buyer, price, amount, totalCost) => {
        if (this.activeAuctions.has(auctionId)) {
          this.logger.success(
            `Auction settled! Buyer: ${buyer.slice(0, 6)}...${buyer.slice(-4)}, ` +
            `Price: ${ethers.formatEther(price)} ETH per token, ` +
            `Total: ${ethers.formatEther(totalCost)} ETH`
          );
          this.activeAuctions.delete(auctionId);
        }
      }
    );

    this.auctionContract.on("AuctionCancelled", (auctionId) => {
      if (this.activeAuctions.has(auctionId)) {
        this.logger.warn(`Auction cancelled: ${auctionId.slice(0, 10)}...`);
        this.activeAuctions.delete(auctionId);
      }
    });
  }

  private async createRandomAuction() {
    const scenario = AUCTION_SCENARIOS[
      Math.floor(Math.random() * AUCTION_SCENARIOS.length)
    ];
    
    await this.createAuction(scenario);
  }

  private async createAuction(scenario: TokenAuctionScenario) {
    try {
      const tokenContract = this.tokenContracts.get(scenario.token);
      if (!tokenContract) {
        this.logger.error(`Unknown token: ${scenario.token}`);
        return;
      }

      const tokenAddress = await tokenContract.getAddress();
      const decimals = await tokenContract.decimals();
      const symbol = await tokenContract.symbol();
      
      const amount = ethers.parseUnits(scenario.amount, decimals);
      const startPrice = ethers.parseEther(scenario.startPriceEth);
      const endPrice = ethers.parseEther(scenario.endPriceEth);
      
      const auctionId = ethers.keccak256(
        ethers.toUtf8Bytes(`token-auction-${Date.now()}-${this.auctionCounter++}`)
      );

      this.logger.log(`Creating ${scenario.name}:`, {
        auctionId: auctionId.slice(0, 10) + "...",
        token: symbol,
        amount: scenario.amount,
        startPrice: scenario.startPriceEth + " ETH per " + symbol,
        endPrice: scenario.endPriceEth + " ETH per " + symbol,
        duration: scenario.duration + "s",
      });

      // First approve the auction contract to spend tokens
      const approveTx = await tokenContract.approve(this.config.auctionContract, amount);
      await approveTx.wait();
      this.logger.log("Token approval confirmed");

      // Create the auction
      const tx = await this.auctionContract.createAuction(
        auctionId,
        tokenAddress,
        amount,
        startPrice,
        endPrice,
        scenario.duration
      );

      this.logger.log(`Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      this.logger.success(`Auction created! Block: ${receipt.blockNumber}`);
    } catch (error: any) {
      this.logger.error(`Failed to create auction:`, error.message);
    }
  }

  async stop() {
    this.logger.log("Stopping token seller service...");
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    // Remove event listeners
    await this.auctionContract.removeAllListeners();
    
    this.logger.log("Token seller service stopped.");
  }
}