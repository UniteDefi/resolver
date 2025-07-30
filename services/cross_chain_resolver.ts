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
      
      // Load TestEscrowFactory contracts with correct ABI
      const TEST_ESCROW_FACTORY_ABI = [
        "function createDstEscrow(bytes calldata data, uint256) external payable returns (address)",
        "function addressOfEscrowSrc(bytes calldata data) external view returns (address)",
        "function addressOfEscrowDst(bytes calldata data) external view returns (address)",
        "event EscrowCreated(address escrow, bool isSource)"
      ];
      
      const dstEscrowFactory = new ethers.Contract(dstChainConfig.escrowFactory, TEST_ESCROW_FACTORY_ABI, dstSigner);
      
      // Calculate safety deposit amount
      const safetyDepositWei = ethers.parseEther(this.config.minSafetyDeposit); // Convert ETH to wei
      
      // Calculate destination amount from source amount and market price
      const srcAmountBig = BigInt(order.srcAmount);
      const marketPriceBig = ethers.parseEther(order.marketPrice);
      const dstAmount = (srcAmountBig * marketPriceBig) / ethers.parseEther("1");
      
      this.logger.log(`Calculated dstAmount: ${dstAmount.toString()} (from ${order.srcAmount} * ${order.marketPrice})`);
      
      // Encode data for TestEscrowFactory: (bytes32 secretHash, address user, address resolver, address token, uint256 amount)
      const escrowData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "address", "address", "uint256"],
        [order.secretHash, order.userAddress, this.wallet.address, order.dstToken, dstAmount.toString()]
      );
      
      this.logger.log(`Step 5a: Deploying destination escrow with safety deposit: ${this.config.minSafetyDeposit} ETH`);
      
      // Deploy destination escrow first
      const dstTx = await dstEscrowFactory.createDstEscrow(
        escrowData,
        0, // unused parameter in TestEscrowFactory
        { value: safetyDepositWei }
      );
      const dstReceipt = await dstTx.wait();
      
      this.logger.log(`Step 5b: Destination escrow deployed in tx: ${dstTx.hash}`);
      
      // Get the destination escrow address from the contract call result
      const dstEscrowAddress = await dstEscrowFactory.addressOfEscrowDst(escrowData);
      
      this.logger.log(`Step 5 Complete: Destination escrow deployed at: ${dstEscrowAddress}`);
      
      // For our simplified flow, we only deploy destination escrow
      // Source escrow is handled by the relayer moving funds to destination escrow
      
      // Step 6: Notify relayer that escrows are ready
      await this.notifyEscrowsReady(order, dstEscrowAddress, dstEscrowAddress, dstTx.hash, dstTx.hash);
      
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
      
      // Start monitoring for secret reveal
      this.monitorSecretReveal(order);
      
    } catch (error) {
      this.logger.error(`Error in Step 8 (settlement) for order ${order.orderId}:`, error);
    }
  }
  
  private async monitorSecretReveal(order: CrossChainOrderData): Promise<void> {
    this.logger.log(`Step 9-10: Monitoring for secret reveal on order ${order.orderId}`);
    
    const maxAttempts = 60; // Monitor for up to 5 minutes
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(
          `${this.config.relayerApiUrl}/api/order-secret/${order.orderId}?resolverAddress=${this.wallet.address}`
        );
        
        if (response.data.status === "revealed") {
          this.logger.success(`Secret revealed for order ${order.orderId}!`);
          this.logger.log(`Reveal TX: ${response.data.revealTxHash}`);
          
          // Retrieve the secret from blockchain logs
          await this.withdrawFromSourceEscrow(
            order,
            response.data.srcEscrowAddress,
            response.data.revealTxHash
          );
          
          break;
        }
      } catch (error: any) {
        if (error.response?.status !== 400) {
          this.logger.error(`Error monitoring secret for order ${order.orderId}:`, error);
        }
      }
      
      await this.sleep(5000); // Check every 5 seconds
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      this.logger.error(`Timeout waiting for secret reveal on order ${order.orderId}`);
    }
  }
  
  private async withdrawFromSourceEscrow(
    order: CrossChainOrderData,
    srcEscrowAddress: string,
    revealTxHash: string
  ): Promise<void> {
    try {
      this.logger.log(`Step 10: Withdrawing from source escrow for order ${order.orderId}`);
      
      const dstProvider = this.providers.get(order.dstChainId);
      const srcProvider = this.providers.get(order.srcChainId);
      
      if (!dstProvider || !srcProvider) {
        throw new Error("Providers not available");
      }
      
      // First, retrieve the revealed secret from destination chain logs
      const receipt = await dstProvider.getTransactionReceipt(revealTxHash);
      if (!receipt) {
        throw new Error("Reveal transaction receipt not found");
      }
      
      // Look for the secret in the event logs
      const escrowInterface = new ethers.Interface([
        "event EscrowWithdrawal(bytes32 secret)"
      ]);
      
      let revealedSecret: string | null = null;
      
      for (const log of receipt.logs) {
        try {
          const parsed = escrowInterface.parseLog({
            topics: log.topics as string[],
            data: log.data
          });
          
          if (parsed && parsed.name === "EscrowWithdrawal") {
            const secretBytes32 = parsed.args[0];
            revealedSecret = ethers.decodeBytes32String(secretBytes32);
            this.logger.log(`Found revealed secret: ${revealedSecret}`);
            break;
          }
        } catch (e) {
          // Not the event we're looking for
        }
      }
      
      if (!revealedSecret) {
        throw new Error("Could not find revealed secret in transaction logs");
      }
      
      // Now withdraw from source escrow using the revealed secret
      const srcSigner = this.wallet.connect(srcProvider);
      
      const SIMPLE_ESCROW_ABI = [
        "function claimWithSecret(bytes32 secret) external",
        "function claimed() view returns (bool)"
      ];
      
      const srcEscrowContract = new ethers.Contract(srcEscrowAddress, SIMPLE_ESCROW_ABI, srcSigner);
      
      // Check if already claimed
      const isClaimed = await srcEscrowContract.claimed();
      if (isClaimed) {
        this.logger.warn(`Source escrow already claimed for order ${order.orderId}`);
        return;
      }
      
      // Convert secret back to bytes32
      const secretBytes32 = ethers.encodeBytes32String(revealedSecret);
      
      this.logger.log(`Withdrawing from source escrow with secret...`);
      const tx = await srcEscrowContract.claimWithSecret(secretBytes32);
      const srcReceipt = await tx.wait();
      
      this.logger.success(`Step 10 Complete: Withdrew from source escrow in tx: ${tx.hash}`);
      this.logger.success(`🎉 CROSS-CHAIN SWAP COMPLETED for order ${order.orderId}`);
      
    } catch (error) {
      this.logger.error(`Error in Step 10 (source withdrawal) for order ${order.orderId}:`, error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}