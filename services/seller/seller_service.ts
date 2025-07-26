import { ethers } from "ethers";
import { Logger } from "../common/logger";
import { 
  CHAINS, 
  AUCTION_ABI,
  TEST_TOKEN,
  TEST_AMOUNT,
  TEST_START_PRICE,
  TEST_END_PRICE,
  TEST_DURATION
} from "../common/config";

export interface SellerConfig {
  privateKey: string;
  chains: string[];
  auctionInterval: number; // ms between auctions
  testScenarios: TestScenario[];
}

export interface TestScenario {
  name: string;
  startPrice: string;
  endPrice: string;
  duration: number;
  amount: string;
}

export class SellerService {
  private logger: Logger;
  private providers: Map<string, ethers.Provider> = new Map();
  private contracts: Map<string, ethers.Contract> = new Map();
  private wallet: ethers.Wallet;
  private auctionCounter = 0;
  private intervalId?: NodeJS.Timeout;

  constructor(private config: SellerConfig) {
    this.logger = new Logger("Seller");
    this.wallet = new ethers.Wallet(config.privateKey);
    this.initializeProviders();
  }

  private initializeProviders() {
    for (const chain of this.config.chains) {
      const chainConfig = CHAINS[chain as keyof typeof CHAINS];
      if (!chainConfig) {
        this.logger.error(`Unknown chain: ${chain}`);
        continue;
      }

      const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
      const signer = this.wallet.connect(provider);
      const contract = new ethers.Contract(
        chainConfig.auctionContract,
        AUCTION_ABI,
        signer
      );

      this.providers.set(chain, provider);
      this.contracts.set(chain, contract);
      
      this.logger.log(`Initialized provider for ${chain}`);
    }
  }

  async start() {
    this.logger.log("Starting seller service...");
    
    // Create initial auctions
    await this.createAuctions();
    
    // Schedule periodic auctions
    this.intervalId = setInterval(() => this.createAuctions(), this.config.auctionInterval);
  }

  private async createAuctions() {
    // Pick a random test scenario
    const scenario = this.config.testScenarios[
      Math.floor(Math.random() * this.config.testScenarios.length)
    ];
    
    // Pick a random chain
    const chains = Array.from(this.contracts.keys());
    const chain = chains[Math.floor(Math.random() * chains.length)];
    
    await this.createAuction(chain, scenario);
  }

  private async createAuction(chain: string, scenario: TestScenario) {
    try {
      const contract = this.contracts.get(chain);
      if (!contract) return;

      const auctionId = ethers.keccak256(
        ethers.toUtf8Bytes(`auction-${Date.now()}-${this.auctionCounter++}`)
      );

      this.logger.log(`Creating ${scenario.name} auction on ${chain}:`, {
        auctionId: auctionId.slice(0, 10) + "...",
        startPrice: scenario.startPrice,
        endPrice: scenario.endPrice,
        duration: scenario.duration,
        amount: scenario.amount
      });

      const tx = await contract.createAuction(
        auctionId,
        TEST_TOKEN,
        ethers.parseEther(scenario.amount),
        ethers.parseEther(scenario.startPrice),
        ethers.parseEther(scenario.endPrice),
        scenario.duration
      );

      const receipt = await tx.wait();
      this.logger.success(`Auction created! TX: ${receipt.hash}`);
      
    } catch (error: any) {
      this.logger.error(`Failed to create auction on ${chain}:`, error.message);
    }
  }

  async createSpecificAuction(chain: string, scenario: TestScenario) {
    await this.createAuction(chain, scenario);
  }

  async stop() {
    this.logger.log("Stopping seller service...");
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    // Remove all listeners
    for (const contract of this.contracts.values()) {
      contract.removeAllListeners();
    }
  }
}