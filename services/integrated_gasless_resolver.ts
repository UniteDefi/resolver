import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

interface ActiveAuction {
  auctionId: string;
  srcChainId: number;
  srcToken: string;
  srcAmount: string;
  dstChainId: number;
  dstToken: string;
  startPrice: string;
  endPrice: string;
  createdAt: number;
  expiresAt: number;
  currentPrice: string;
}

interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  escrowFactory: string;
}

export class IntegratedGaslessResolver {
  private name: string;
  private privateKey: string;
  private relayerUrl: string;
  private providers: Map<number, ethers.JsonRpcProvider> = new Map();
  private wallets: Map<number, ethers.Wallet> = new Map();
  private chains: ChainConfig[];
  private minProfitUSD: number;
  private checkInterval: number;
  private isRunning: boolean = false;
  
  // Mock token prices
  private tokenPrices: Map<string, number> = new Map([
    ["USDT", 1],
    ["DAI", 1],
    ["USDC", 1],
    ["LINK", 15]
  ]);

  constructor(
    name: string,
    privateKey: string,
    relayerUrl: string,
    chains: ChainConfig[],
    minProfitUSD: number = 0.5,
    checkInterval: number = 5000
  ) {
    this.name = name;
    this.privateKey = privateKey;
    this.relayerUrl = relayerUrl;
    this.chains = chains;
    this.minProfitUSD = minProfitUSD;
    this.checkInterval = checkInterval;
    
    // Initialize providers and wallets
    chains.forEach(chain => {
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      this.providers.set(chain.chainId, provider);
      
      const wallet = new ethers.Wallet(privateKey, provider);
      this.wallets.set(chain.chainId, wallet);
    });
  }

  async start() {
    console.log(`[${this.name}] Starting integrated gasless resolver...`);
    console.log(`[${this.name}] Relayer URL: ${this.relayerUrl}`);
    console.log(`[${this.name}] Min profit: $${this.minProfitUSD}`);
    
    this.isRunning = true;
    this.monitorAuctions();
  }

  stop() {
    console.log(`[${this.name}] Stopping resolver...`);
    this.isRunning = false;
  }

  private async monitorAuctions() {
    while (this.isRunning) {
      try {
        await this.checkActiveAuctions();
      } catch (error) {
        console.error(`[${this.name}] Error monitoring:`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
    }
  }

  private async checkActiveAuctions() {
    try {
      const response = await axios.get(`${this.relayerUrl}/api/active-auctions`);
      const auctions: ActiveAuction[] = response.data;
      
      console.log(`[${this.name}] Found ${auctions.length} active auctions`);
      
      for (const auction of auctions) {
        await this.evaluateAuction(auction);
      }
    } catch (error) {
      console.error(`[${this.name}] Error fetching auctions:`, error);
    }
  }

  private async evaluateAuction(auction: ActiveAuction) {
    // Simple profitability check
    const srcAmount = Number(ethers.formatUnits(auction.srcAmount, 6));
    const dstAmount = Number(ethers.formatUnits(auction.currentPrice, 6));
    
    // Assume both are stablecoins for now
    const srcValue = srcAmount * 1; // USD value
    const dstValue = dstAmount * 1; // USD value
    
    const profit = srcValue - dstValue;
    
    console.log(`[${this.name}] Auction ${auction.auctionId.slice(0, 10)}...`);
    console.log(`  Selling: ${srcAmount} USDT ($${srcValue})`);
    console.log(`  Buying: ${dstAmount} DAI ($${dstValue})`);
    console.log(`  Profit: $${profit.toFixed(2)}`);
    
    if (profit >= this.minProfitUSD) {
      console.log(`[${this.name}] ✅ Profitable! Attempting to fill...`);
      await this.fillAuction(auction, profit);
    }
  }

  private async fillAuction(auction: ActiveAuction, profit: number) {
    try {
      const srcWallet = this.wallets.get(auction.srcChainId)!;
      const dstWallet = this.wallets.get(auction.dstChainId)!;
      
      // Step 1: Create mock escrows
      const srcEscrow = "0x" + "1".repeat(40);
      const dstEscrow = "0x" + "2".repeat(40);
      
      console.log(`[${this.name}] Creating escrows...`);
      console.log(`  Source escrow: ${srcEscrow}`);
      console.log(`  Destination escrow: ${dstEscrow}`);
      
      // Step 2: Commit to relayer
      const commitment = {
        auctionId: auction.auctionId,
        resolverAddress: srcWallet.address,
        srcEscrowAddress: srcEscrow,
        dstEscrowAddress: dstEscrow,
        srcSafetyDepositTx: "0x" + "a".repeat(64),
        dstSafetyDepositTx: "0x" + "b".repeat(64),
        committedPrice: auction.currentPrice,
        timestamp: Date.now()
      };
      
      const commitResponse = await axios.post(
        `${this.relayerUrl}/api/commit-resolver`,
        commitment
      );
      
      if (commitResponse.data.success) {
        console.log(`[${this.name}] ✅ Committed to auction!`);
        
        // Step 3: Simulate settlement
        await this.settleAuction(auction);
      }
      
    } catch (error: any) {
      console.error(`[${this.name}] Error filling auction:`, error.response?.data || error.message);
    }
  }

  private async deployEscrowsWithDeposits(order: ActiveOrder) {
    console.log(`[${this.name}] Deploying escrows with safety deposits...`);
    
    try {
      const srcWallet = this.wallets.get(order.srcChainId)!;
      const dstWallet = this.wallets.get(order.dstChainId)!;
      
      // Calculate safety deposit (10% of order value)
      const safetyDepositAmount = BigInt(order.srcAmount) / 10n;
      
      // Deploy source escrow
      const srcFactory = new ethers.Contract(
        this.chains.find(c => c.chainId === order.srcChainId)!.escrowFactory,
        this.ESCROW_FACTORY_ABI,
        srcWallet
      );
      
      console.log(`[${this.name}] Deploying source escrow on chain ${order.srcChainId}...`);
      const srcEscrowTx = await srcFactory.deployEscrow(
        order.secretHash,
        3600, // 1 hour timelock
        order.srcToken,
        order.srcAmount,
        srcWallet.address, // Resolver receives source tokens
        srcWallet.address
      );
      
      const srcReceipt = await srcEscrowTx.wait();
      const srcEscrowAddress = srcReceipt.logs[0].address; // Get deployed escrow address
      
      // Deploy destination escrow
      const dstFactory = new ethers.Contract(
        this.chains.find(c => c.chainId === order.dstChainId)!.escrowFactory,
        this.ESCROW_FACTORY_ABI,
        dstWallet
      );
      
      console.log(`[${this.name}] Deploying destination escrow on chain ${order.dstChainId}...`);
      const dstEscrowTx = await dstFactory.deployEscrow(
        order.secretHash,
        3600, // 1 hour timelock
        order.dstToken,
        order.marketPrice,
        order.userAddress, // User receives destination tokens
        dstWallet.address
      );
      
      const dstReceipt = await dstEscrowTx.wait();
      const dstEscrowAddress = dstReceipt.logs[0].address;
      
      // Deposit safety deposits to both escrows
      console.log(`[${this.name}] Depositing safety deposits...`);
      
      // Source chain safety deposit
      const srcToken = new ethers.Contract(order.srcToken, this.ERC20_ABI, srcWallet);
      await (await srcToken.transfer(srcEscrowAddress, safetyDepositAmount)).wait();
      
      // Destination chain safety deposit
      const dstToken = new ethers.Contract(order.dstToken, this.ERC20_ABI, dstWallet);
      const dstSafetyDeposit = BigInt(order.marketPrice) / 10n;
      await (await dstToken.transfer(dstEscrowAddress, dstSafetyDeposit)).wait();
      
      // Notify relayer that escrows are ready
      console.log(`[${this.name}] Notifying relayer of escrow deployment...`);
      await axios.post(`${this.relayerUrl}/api/escrows-ready`, {
        orderId: order.orderId,
        resolverAddress: srcWallet.address,
        srcEscrowAddress,
        dstEscrowAddress,
        srcSafetyDepositTx: srcReceipt.hash,
        dstSafetyDepositTx: dstReceipt.hash
      });
      
      console.log(`[${this.name}] ✅ Escrows deployed and ready!`);
      console.log(`  Source escrow: ${srcEscrowAddress}`);
      console.log(`  Destination escrow: ${dstEscrowAddress}`);
      
      // Continue with settlement
      await this.completeSettlement(order, srcEscrowAddress, dstEscrowAddress);
      
    } catch (error: any) {
      console.error(`[${this.name}] Error deploying escrows:`, error);
      this.activeCommitments.delete(order.orderId);
    }
  }
  
  private async completeSettlement(order: ActiveOrder, srcEscrow: string, dstEscrow: string) {
    console.log(`[${this.name}] Completing settlement...`);
    
    try {
      const dstWallet = this.wallets.get(order.dstChainId)!;
      
      // Wait for relayer to move user funds to source escrow
      console.log(`[${this.name}] Waiting for user funds to be moved...`);
      
      // Poll for user funds movement (in production, use events)
      let userFundsMoved = false;
      for (let i = 0; i < 30; i++) { // Wait up to 3 minutes
        const status = await axios.get(`${this.relayerUrl}/api/order-status/${order.orderId}`);
        if (status.data.userFundsMoved) {
          userFundsMoved = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 6000)); // Check every 6 seconds
      }
      
      if (!userFundsMoved) {
        throw new Error("User funds not moved in time");
      }
      
      console.log(`[${this.name}] User funds moved to source escrow`);
      
      // Deposit resolver funds to destination escrow
      console.log(`[${this.name}] Depositing resolver funds to destination escrow...`);
      const dstToken = new ethers.Contract(order.dstToken, this.ERC20_ABI, dstWallet);
      const depositTx = await dstToken.transfer(dstEscrow, order.marketPrice);
      await depositTx.wait();
      
      // Notify relayer of completion
      await axios.post(`${this.relayerUrl}/api/notify-completion`, {
        orderId: order.orderId,
        resolverAddress: dstWallet.address,
        dstTokenAmount: order.marketPrice,
        dstTxHash: depositTx.hash
      });
      
      console.log(`[${this.name}] ✅ Settlement completed! Waiting for secret reveal...`);
      
      // Clean up commitment
      this.activeCommitments.delete(order.orderId);
      
    } catch (error: any) {
      console.error(`[${this.name}] Settlement error:`, error.message);
      this.activeCommitments.delete(order.orderId);
    }
  }
}

// Start resolver if run directly
if (require.main === module) {
  const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:3000";
  
  // Load escrow factory deployments
  const factoryDeployments = require("../escrow_factory_deployments.json");
  
  const chains: ChainConfig[] = [
    {
      chainId: 84532,
      name: "Base Sepolia",
      rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      escrowFactory: factoryDeployments.BASE_SEPOLIA.escrowFactory
    },
    {
      chainId: 421614,
      name: "Arbitrum Sepolia",
      rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      escrowFactory: factoryDeployments.ARBITRUM_SEPOLIA.escrowFactory
    }
  ];
  
  const resolver = new IntegratedGaslessResolver(
    "Integrated Resolver",
    process.env.RESOLVER1_WALLET_PRIVATE_KEY!,
    RELAYER_URL,
    chains,
    0.1, // Low min profit for testing
    3000 // Check every 3 seconds
  );
  
  resolver.start();
  
  process.on("SIGINT", () => {
    resolver.stop();
    process.exit(0);
  });
}