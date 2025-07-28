import { ethers } from "ethers";
import axios from "axios";
import { Logger } from "./common/logger";

export interface CrossChainOrderData {
  orderId: string;
  srcChainId: number;
  srcToken: string;
  srcAmount: string;
  dstChainId: number;
  dstToken: string;
  marketPrice: string;
  userAddress: string;
  secretHash: string;
  createdAt: number;
  expiresAt: number;
  status: string;
}

export interface ResolverConfig {
  id: string;
  privateKey: string;
  relayerApiUrl: string;
  maxAcceptablePrice: string;
  minSafetyDeposit: string;
  chains: {
    [chainId: number]: {
      name: string;
      rpcUrl: string;
      escrowFactory: string;
      nativeTokenDecimals: number;
    };
  };
  pollIntervalMs: number;
}

export class CrossChainResolver {
  private logger: Logger;
  private wallet: ethers.Wallet;
  private providers: Map<number, ethers.Provider> = new Map();
  private processingOrders: Set<string> = new Set();
  private running = false;

  constructor(private config: ResolverConfig) {
    this.logger = new Logger(`CrossChainResolver-${config.id}`);
    this.wallet = new ethers.Wallet(config.privateKey);
    this.initializeProviders();
  }

  private initializeProviders(): void {
    for (const [chainId, chainConfig] of Object.entries(this.config.chains)) {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.providers.set(Number(chainId), provider);
      this.logger.log(`Initialized provider for chain ${chainId} (${chainConfig.name})`);
    }
  }

  async start(): Promise<void> {
    this.logger.log("Starting cross-chain resolver...");
    
    // Check balances on all chains
    await this.checkBalances();
    
    this.running = true;
    
    // Start monitoring orders
    this.monitorOrders();
    
    this.logger.success("Cross-chain resolver started successfully");
  }

  async stop(): Promise<void> {
    this.logger.log("Stopping cross-chain resolver...");
    this.running = false;
  }

  private async checkBalances(): Promise<void> {
    this.logger.log("Checking balances across all chains...");
    
    for (const [chainId, chainConfig] of Object.entries(this.config.chains)) {
      try {
        const provider = this.providers.get(Number(chainId));
        if (!provider) continue;
        
        const balance = await provider.getBalance(this.wallet.address);
        const formattedBalance = ethers.formatUnits(balance, chainConfig.nativeTokenDecimals);
        
        this.logger.log(`Balance on ${chainConfig.name}: ${formattedBalance} native tokens`);
        
        // Check if balance is sufficient for safety deposits
        const minBalance = ethers.parseUnits(this.config.minSafetyDeposit, chainConfig.nativeTokenDecimals);
        if (balance < minBalance) {
          this.logger.warn(`Low balance on ${chainConfig.name}! Need at least ${this.config.minSafetyDeposit}`);
        }
      } catch (error) {
        this.logger.error(`Failed to check balance on chain ${chainId}:`, error);
      }
    }
  }

  private async monitorOrders(): Promise<void> {
    while (this.running) {
      try {
        await this.fetchAndProcessOrders();
        await this.sleep(this.config.pollIntervalMs);
      } catch (error) {
        this.logger.error("Error monitoring orders:", error);
        await this.sleep(5000); // Wait 5 seconds before retrying
      }
    }
  }

  private async fetchAndProcessOrders(): Promise<void> {
    try {
      const response = await axios.get(`${this.config.relayerApiUrl}/api/active-orders`);
      const orders: CrossChainOrderData[] = response.data;
      
      for (const order of orders) {
        if (!this.processingOrders.has(order.orderId)) {
          if (order.status === "active") {
            await this.evaluateOrder(order);
          } else if (order.status === "rescue_available") {
            await this.evaluateRescueOpportunity(order);
          }
        }
      }
    } catch (error) {
      this.logger.error("Failed to fetch active orders:", error);
    }
  }

  private async evaluateOrder(order: CrossChainOrderData): Promise<void> {
    this.logger.log(`Evaluating order ${order.orderId}`);
    
    // Check if we support both chains
    const srcChainConfig = this.config.chains[order.srcChainId];
    const dstChainConfig = this.config.chains[order.dstChainId];
    
    if (!srcChainConfig || !dstChainConfig) {
      this.logger.log(`Skipping order ${order.orderId} - unsupported chains`);
      return;
    }
    
    // Check if price is acceptable
    const marketPriceWei = ethers.parseUnits(order.marketPrice, 18);
    const maxAcceptablePriceWei = ethers.parseUnits(this.config.maxAcceptablePrice, 18);
    
    if (marketPriceWei > maxAcceptablePriceWei) {
      this.logger.log(`Skipping order ${order.orderId} - price too high: ${order.marketPrice}`);
      return;
    }
    
    // Check if order is still valid (not expired)
    if (Date.now() > order.expiresAt) {
      this.logger.log(`Skipping order ${order.orderId} - order expired`);
      return;
    }
    
    // Commit to the order
    await this.commitToOrder(order);
  }

  private async evaluateRescueOpportunity(order: CrossChainOrderData): Promise<void> {
    this.logger.log(`Evaluating rescue opportunity for order ${order.orderId}`);
    
    // Check if we support both chains
    const srcChainConfig = this.config.chains[order.srcChainId];
    const dstChainConfig = this.config.chains[order.dstChainId];
    
    if (!srcChainConfig || !dstChainConfig) {
      this.logger.log(`Skipping rescue ${order.orderId} - unsupported chains`);
      return;
    }
    
    // Check if order is still valid (not expired)
    if (Date.now() > order.expiresAt) {
      this.logger.log(`Skipping rescue ${order.orderId} - order expired`);
      return;
    }
    
    // Rescue opportunities are more attractive due to penalty rewards
    this.logger.log(`🚨 RESCUE OPPORTUNITY: Order ${order.orderId} available for rescue with penalty rewards!`);
    
    // Commit to rescue the order
    await this.commitToRescue(order);
  }

  private async commitToOrder(order: CrossChainOrderData): Promise<void> {
    this.processingOrders.add(order.orderId);
    
    try {
      this.logger.log(`Committing to order ${order.orderId}`);
      
      const commitment = {
        orderId: order.orderId,
        resolverAddress: this.wallet.address,
        acceptedPrice: order.marketPrice,
        timestamp: Date.now()
      };
      
      const response = await axios.post(
        `${this.config.relayerApiUrl}/api/commit-resolver`,
        commitment
      );
      
      if (response.data.success) {
        this.logger.success(`Successfully committed to order ${order.orderId}`);
        // Start escrow deployment process
        await this.deployEscrows(order);
      } else {
        this.logger.warn(`Failed to commit to order ${order.orderId}`);
      }
    } catch (error) {
      this.logger.error(`Error committing to order ${order.orderId}:`, error);
    } finally {
      this.processingOrders.delete(order.orderId);
    }
  }

  private async commitToRescue(order: CrossChainOrderData): Promise<void> {
    this.processingOrders.add(order.orderId);
    
    try {
      this.logger.log(`🚨 Committing to RESCUE order ${order.orderId}`);
      
      const rescueData = {
        orderId: order.orderId,
        resolverAddress: this.wallet.address
      };
      
      const response = await axios.post(
        `${this.config.relayerApiUrl}/api/rescue-order`,
        rescueData
      );
      
      if (response.data.success) {
        this.logger.success(`Successfully committed to rescue order ${order.orderId}`);
        this.logger.log(`Reward: Can claim original resolver's safety deposits as penalty`);
        // Start escrow deployment process for rescue
        await this.deployEscrows(order);
      } else {
        this.logger.warn(`Failed to commit to rescue order ${order.orderId}`);
      }
    } catch (error) {
      this.logger.error(`Error committing to rescue order ${order.orderId}:`, error);
    } finally {
      this.processingOrders.delete(order.orderId);
    }
  }

  private async deployEscrows(order: CrossChainOrderData): Promise<void> {
    try {
      this.logger.log(`Step 5: Deploying escrow contracts for order ${order.orderId}`);
      
      const srcProvider = this.providers.get(order.srcChainId);
      const dstProvider = this.providers.get(order.dstChainId);
      
      if (!srcProvider || !dstProvider) {
        throw new Error("Providers not available for required chains");
      }
      
      const srcSigner = this.wallet.connect(srcProvider);
      const dstSigner = this.wallet.connect(dstProvider);
      
      const srcChainConfig = this.config.chains[order.srcChainId];
      const dstChainConfig = this.config.chains[order.dstChainId];
      
      // Load escrow factory contracts using proper 1inch interface
      const ESCROW_FACTORY_ABI = [
        "function createDstEscrow(tuple(bytes32 hashlockInfo, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint256 chainId, tuple(uint256 deploying, uint256 privateWithdrawal, uint256 publicWithdrawal, uint256 privateCancellation, uint256 publicCancellation) timelocks) dstImmutables, uint256 srcCancellationTimestamp) external payable",
        "function addressOfEscrowSrc(tuple(...) immutables) external view returns (address)",
        "function addressOfEscrowDst(tuple(...) immutables) external view returns (address)",
        "event SrcEscrowCreated(tuple(...) srcImmutables, tuple(...) dstImmutablesComplement)",
        "event DstEscrowCreated(address escrow, bytes32 hashlock, address taker)"
      ];
      
      const srcEscrowFactory = new ethers.Contract(srcChainConfig.escrowFactory, ESCROW_FACTORY_ABI, srcSigner);
      const dstEscrowFactory = new ethers.Contract(dstChainConfig.escrowFactory, ESCROW_FACTORY_ABI, dstSigner);
      
      // Calculate safety deposit amount
      const safetyDepositWei = ethers.parseUnits(this.config.minSafetyDeposit, srcChainConfig.nativeTokenDecimals);
      
      // Create proper escrow immutables following 1inch pattern
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const escrowImmutables = {
        hashlockInfo: order.secretHash,
        maker: order.userAddress,
        taker: this.wallet.address,
        token: order.srcToken,
        amount: order.srcAmount,
        safetyDeposit: safetyDepositWei.toString(),
        chainId: order.srcChainId,
        timelocks: {
          deploying: currentTimestamp,
          privateWithdrawal: currentTimestamp + 600, // 10 minutes
          publicWithdrawal: currentTimestamp + 1200, // 20 minutes
          privateCancellation: currentTimestamp + 1800, // 30 minutes
          publicCancellation: currentTimestamp + 2400 // 40 minutes
        }
      };
      
      this.logger.log(`Step 5a: Deploying destination escrow with safety deposit: ${this.config.minSafetyDeposit}`);
      
      // Deploy destination escrow first (as per 1inch pattern)
      const dstTx = await dstEscrowFactory.createDstEscrow(
        escrowImmutables,
        escrowImmutables.timelocks.privateCancellation,
        { value: safetyDepositWei }
      );
      const dstReceipt = await dstTx.wait();
      
      this.logger.log(`Step 5b: Destination escrow deployed in tx: ${dstTx.hash}`);
      
      // Get escrow addresses using proper calculation
      const srcEscrowAddress = await srcEscrowFactory.addressOfEscrowSrc(escrowImmutables);
      const dstEscrowAddress = await dstEscrowFactory.addressOfEscrowDst(escrowImmutables);
      
      this.logger.log(`Step 5 Complete: Escrows deployed - Src: ${srcEscrowAddress}, Dst: ${dstEscrowAddress}`);
      
      // Step 6: Notify relayer that escrows are ready
      await this.notifyEscrowsReady(order, srcEscrowAddress, dstEscrowAddress, "pending_src_deployment", dstTx.hash);
      
    } catch (error) {
      this.logger.error(`Error in Step 5 (deploying escrows) for order ${order.orderId}:`, error);
    }
  }

  private async notifyEscrowsReady(
    order: CrossChainOrderData,
    srcEscrowAddress: string,
    dstEscrowAddress: string,
    srcSafetyDepositTx: string,
    dstSafetyDepositTx: string
  ): Promise<void> {
    try {
      const notification = {
        orderId: order.orderId,
        resolverAddress: this.wallet.address,
        srcEscrowAddress,
        dstEscrowAddress,
        srcSafetyDepositTx,
        dstSafetyDepositTx
      };
      
      await axios.post(`${this.config.relayerApiUrl}/api/escrows-ready`, notification);
      this.logger.success(`Notified relayer that escrows are ready for order ${order.orderId}`);
      
      // Start settlement process
      await this.performSettlement(order, dstEscrowAddress);
      
    } catch (error) {
      this.logger.error(`Error notifying escrows ready for order ${order.orderId}:`, error);
    }
  }

  private async performSettlement(order: CrossChainOrderData, dstEscrowAddress: string): Promise<void> {
    try {
      this.logger.log(`Step 8: Performing settlement for order ${order.orderId}`);
      
      const dstProvider = this.providers.get(order.dstChainId);
      if (!dstProvider) throw new Error("Destination provider not available");
      
      const dstSigner = this.wallet.connect(dstProvider);
      
      // Calculate destination token amount based on market price
      const srcAmountBN = ethers.parseUnits(order.srcAmount, 18);
      const marketPriceBN = ethers.parseUnits(order.marketPrice, 18);
      const dstAmount = (srcAmountBN * marketPriceBN) / ethers.parseUnits("1", 18);
      
      this.logger.log(`Step 8a: Depositing ${ethers.formatUnits(dstAmount, 18)} destination tokens to escrow`);
      
      // Transfer destination tokens to escrow
      const dstTokenContract = new ethers.Contract(
        order.dstToken,
        ["function transfer(address to, uint256 amount) external returns (bool)"],
        dstSigner
      );
      
      const transferTx = await dstTokenContract.transfer(dstEscrowAddress, dstAmount);
      const transferReceipt = await transferTx.wait();
      
      this.logger.log(`Step 8b: Destination tokens deposited in tx: ${transferTx.hash}`);
      
      // Step 8c: Notify relayer that trade execution is complete
      const settlementNotification = {
        orderId: order.orderId,
        resolverAddress: this.wallet.address,
        dstTokenAmount: dstAmount.toString(),
        dstTxHash: transferTx.hash
      };
      
      await axios.post(`${this.config.relayerApiUrl}/api/notify-completion`, settlementNotification);
      this.logger.success(`Step 8 Complete: Trade execution notified to relayer for order ${order.orderId}`);
      
    } catch (error) {
      this.logger.error(`Error in Step 8 (settlement) for order ${order.orderId}:`, error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}