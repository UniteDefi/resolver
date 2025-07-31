import { ethers, formatUnits, parseUnits, Wallet, Contract, JsonRpcProvider } from "ethers";
import dotenv from "dotenv";
import axios from "axios";
import allDeployments from "../deployments.json";

dotenv.config();

interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  wrappedNative: string;
  usdt: string;
  dai: string;
  escrowFactory: string;
}

interface ResolverConfig {
  index: number;
  privateKey: string;
  relayerUrl: string;
  minProfitMargin: number;
  supportedChains: number[];
  pollingInterval: number; // milliseconds
}

interface ActiveOrder {
  orderId: string;
  srcChainId: number;
  srcToken: string;
  srcAmount: string;
  dstChainId: number;
  dstToken: string;
  userAddress: string;
  secretHash: string;
  createdAt: number;
  expiresAt: number;
  status: string;
  currentPrice: string;
  timeRemaining: number;
}

// ERC20 ABI for balance checking
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

// Escrow Factory ABI
const ESCROW_FACTORY_ABI = [
  "function deploySrcEscrow(bytes32 orderId, address resolver, address user, address token, uint256 amount, bytes32 secretHash, uint256 timelock) payable returns (address)",
  "function deployDstEscrow(bytes32 orderId, address resolver, address user, address token, uint256 amount, bytes32 secretHash, uint256 timelock) payable returns (address)",
  "function srcEscrows(bytes32) view returns (address)",
  "function dstEscrows(bytes32) view returns (address)"
];

export class PollingResolverService {
  private config: ResolverConfig;
  private wallet: Wallet;
  private processingOrders: Set<string> = new Set();
  private chainConfigs: Map<number, ChainConfig> = new Map();
  private providers: Map<number, JsonRpcProvider> = new Map();
  private monitoringOrders: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(config: ResolverConfig) {
    this.config = config;
    this.wallet = new Wallet(config.privateKey);
    
    // Initialize chain configs
    this.initializeChainConfigs();
    
    console.log(`[Resolver ${config.index}] Initialized Polling Resolver`);
    console.log(`[Resolver ${config.index}] Wallet Address: ${this.wallet.address}`);
    console.log(`[Resolver ${config.index}] Supported chains: ${config.supportedChains}`);
    console.log(`[Resolver ${config.index}] Polling interval: ${config.pollingInterval}ms`);
  }

  private initializeChainConfigs() {
    const evmDeployments = allDeployments.evm;

    // Process each chain
    const chains = [
      { key: "eth_sepolia", chainId: 11155111 },
      { key: "base_sepolia", chainId: 84532 },
      { key: "arb_sepolia", chainId: 421614 },
      { key: "monad_testnet", chainId: 10143 }
    ];

    for (const chain of chains) {
      const deployment = evmDeployments[chain.key];
      if (deployment) {
        const config: ChainConfig = {
          chainId: deployment.chainId,
          name: deployment.name,
          rpcUrl: this.getRpcUrl(deployment.chainId),
          wrappedNative: deployment.MockWrappedNative,
          usdt: deployment.MockERC20,
          dai: deployment.MockERC20_2,
          escrowFactory: deployment.UniteEscrowFactory,
        };
        this.chainConfigs.set(deployment.chainId, config);
        const provider = new JsonRpcProvider(config.rpcUrl);
        this.providers.set(deployment.chainId, provider);
      }
    }
  }

  private getRpcUrl(chainId: number): string {
    switch (chainId) {
      case 11155111:
        return process.env.SEPOLIA_RPC_URL || "";
      case 84532:
        return process.env.BASE_SEPOLIA_RPC_URL || "";
      case 421614:
        return process.env.ARBITRUM_SEPOLIA_RPC_URL || "";
      case 10143:
        return process.env.MONAD_TESTNET_RPC_URL || "";
      default:
        return "";
    }
  }

  async start(): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Starting polling resolver service...`);
    this.isRunning = true;
    
    // Start polling loop
    this.pollActiveOrders();
  }

  stop(): void {
    console.log(`[Resolver ${this.config.index}] Stopping resolver service...`);
    this.isRunning = false;
    
    // Clear all monitoring intervals
    for (const [orderId, timeout] of this.monitoringOrders) {
      clearTimeout(timeout);
    }
    this.monitoringOrders.clear();
  }

  private async pollActiveOrders(): Promise<void> {
    while (this.isRunning) {
      try {
        // Fetch active orders from relayer
        const response = await axios.get(`${this.config.relayerUrl}/api/active-orders`);
        const activeOrders: ActiveOrder[] = response.data;
        
        console.log(`[Resolver ${this.config.index}] Found ${activeOrders.length} active orders`);
        
        // Process each order
        for (const order of activeOrders) {
          // Skip if we're already monitoring this order
          if (this.monitoringOrders.has(order.orderId)) {
            continue;
          }
          
          // Skip if chains not supported
          if (!this.config.supportedChains.includes(order.srcChainId) ||
              !this.config.supportedChains.includes(order.dstChainId)) {
            continue;
          }
          
          // Start monitoring this order
          this.startMonitoringOrder(order);
        }
        
      } catch (error) {
        console.error(`[Resolver ${this.config.index}] Error polling active orders:`, error);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.config.pollingInterval));
    }
  }

  private startMonitoringOrder(order: ActiveOrder): void {
    console.log(`[Resolver ${this.config.index}] Starting to monitor order ${order.orderId}`);
    
    // Mark as being monitored
    this.monitoringOrders.set(order.orderId, null as any);
    
    // Start continuous price monitoring
    this.monitorOrderPrice(order.orderId);
  }

  private async monitorOrderPrice(orderId: string): Promise<void> {
    let checkCount = 0;
    
    const checkPrice = async () => {
      // Stop if service is shutting down or order expired
      if (!this.isRunning || !this.monitoringOrders.has(orderId)) {
        return;
      }
      
      try {
        // Get current auction price
        const priceResponse = await axios.get(
          `${this.config.relayerUrl}/api/auction-price/${orderId}`
        );
        
        if (!priceResponse.data || priceResponse.data.isExpired) {
          console.log(`[Resolver ${this.config.index}] Order ${orderId} expired`);
          this.monitoringOrders.delete(orderId);
          return;
        }
        
        const { currentPrice, orderData, timeRemaining } = priceResponse.data;
        
        checkCount++;
        console.log(
          `[Resolver ${this.config.index}] Order ${orderId} price check #${checkCount}:`,
          {
            currentPrice,
            timeRemaining: `${timeRemaining}s`,
            srcAmount: formatUnits(orderData.swapRequest.srcAmount, 6),
            checking: "profitability..."
          }
        );
        
        // Check profitability
        const isProfitable = await this.checkProfitability(orderData, currentPrice);
        
        if (isProfitable) {
          console.log(
            `[Resolver ${this.config.index}] Order ${orderId} is NOW PROFITABLE at price ${currentPrice}!`
          );
          
          // Try to commit to the order
          const committed = await this.commitToOrder(orderId, currentPrice);
          
          if (committed) {
            // Stop monitoring this order
            this.monitoringOrders.delete(orderId);
            
            // Execute the order
            await this.executeOrder(orderId, orderData, currentPrice);
          } else {
            // Someone else got it, stop monitoring
            console.log(
              `[Resolver ${this.config.index}] Order ${orderId} was taken by another resolver`
            );
            this.monitoringOrders.delete(orderId);
          }
          
          return;
        }
        
        // Schedule next check - more frequent as time runs out
        const checkInterval = timeRemaining > 60 ? 5000 : 2000; // 5s or 2s
        const timeout = setTimeout(checkPrice, checkInterval);
        this.monitoringOrders.set(orderId, timeout);
        
      } catch (error) {
        console.error(
          `[Resolver ${this.config.index}] Error monitoring order ${orderId}:`,
          error
        );
        
        // Retry after a delay
        const timeout = setTimeout(checkPrice, 5000);
        this.monitoringOrders.set(orderId, timeout);
      }
    };
    
    // Start checking immediately
    checkPrice();
  }

  private async checkProfitability(
    orderData: any,
    currentPrice: string
  ): Promise<boolean> {
    // currentPrice is already a formatted string (e.g., "101.643350")
    const srcAmountRaw = orderData.swapRequest.srcAmount;
    const srcAmount = BigInt(srcAmountRaw);
    
    // Parse the current price and calculate destination amount
    const priceFloat = parseFloat(currentPrice);
    const srcAmountFloat = parseFloat(formatUnits(srcAmount, 6));
    const dstAmountFloat = srcAmountFloat * priceFloat;
    const dstAmount = parseUnits(dstAmountFloat.toFixed(6), 6);
    
    // Resolver profits when they give fewer tokens than market rate
    const marketRate = srcAmount; // Assuming 1:1 for stablecoins
    const maxResolverWillingToGive = (marketRate * BigInt(10000 - Math.floor(this.config.minProfitMargin * 10000))) / 10000n;
    const isProfitable = dstAmount <= maxResolverWillingToGive;
    
    console.log(
      `[Resolver ${this.config.index}] Profitability check:`,
      {
        srcAmount: formatUnits(srcAmount, 6),
        dstAmount: formatUnits(dstAmount, 6),
        currentPrice: currentPrice,
        maxAcceptable: formatUnits(maxResolverWillingToGive, 6),
        isProfitable
      }
    );
    
    return isProfitable;
  }

  private async commitToOrder(
    orderId: string,
    acceptedPrice: string
  ): Promise<boolean> {
    try {
      console.log(
        `[Resolver ${this.config.index}] Attempting to commit to order ${orderId} at price ${acceptedPrice}`
      );

      const response = await axios.post(
        `${this.config.relayerUrl}/api/commit-resolver`,
        {
          orderId,
          resolverAddress: this.wallet.address,
          acceptedPrice,
          timestamp: Date.now(),
        }
      );

      if (response.data.success) {
        console.log(
          `[Resolver ${this.config.index}] Successfully committed to order ${orderId}!`
        );
        return true;
      } else {
        console.log(
          `[Resolver ${this.config.index}] Failed to commit: ${response.data.message}`
        );
        return false;
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(
          `[Resolver ${this.config.index}] Order ${orderId} already taken by another resolver`
        );
      } else {
        console.error(
          `[Resolver ${this.config.index}] Error committing to order:`,
          error.response?.data || error.message
        );
      }
      return false;
    }
  }

  private async executeOrder(
    orderId: string,
    orderData: any,
    acceptedPrice: string
  ): Promise<void> {
    console.log(
      `[Resolver ${this.config.index}] Starting order execution for ${orderId}`
    );
    
    try {
      // Step 1: Deploy escrows on both chains
      const escrows = await this.deployEscrows(orderId, orderData);
      
      // Step 2: Notify relayer that escrows are ready
      await this.notifyEscrowsReady(orderId, escrows, orderData);
      
      // Step 3: Wait for relayer to transfer user funds
      await this.waitForUserFundsTransfer(orderId);
      
      // Step 4: Transfer destination tokens to destination escrow
      await this.transferDestinationTokens(orderId, orderData, acceptedPrice, escrows.dstEscrow);
      
      // Step 5: Notify completion
      await this.notifyCompletion(orderId, orderData, acceptedPrice);
      
      console.log(
        `[Resolver ${this.config.index}] Successfully completed order ${orderId}!`
      );
      
    } catch (error) {
      console.error(
        `[Resolver ${this.config.index}] Error executing order ${orderId}:`,
        error
      );
    }
  }

  private async deployEscrows(
    orderId: string,
    orderData: any
  ): Promise<{ srcEscrow: string; dstEscrow: string }> {
    console.log(`[Resolver ${this.config.index}] Deploying escrows for order ${orderId}`);
    
    const srcChainId = orderData.swapRequest.srcChainId;
    const dstChainId = orderData.swapRequest.dstChainId;
    
    // Get providers and configs
    const srcProvider = this.providers.get(srcChainId);
    const dstProvider = this.providers.get(dstChainId);
    const srcConfig = this.chainConfigs.get(srcChainId);
    const dstConfig = this.chainConfigs.get(dstChainId);
    
    if (!srcProvider || !dstProvider || !srcConfig || !dstConfig) {
      throw new Error("Chain configuration not found");
    }
    
    // Connect wallet to providers
    const srcWallet = this.wallet.connect(srcProvider);
    const dstWallet = this.wallet.connect(dstProvider);
    
    // Calculate safety deposit (0.01 ETH worth of native token)
    const safetyDeposit = parseUnits("0.01", 18);
    
    // Get escrow factory contracts
    const srcFactory = new Contract(srcConfig.escrowFactory, ESCROW_FACTORY_ABI, srcWallet);
    const dstFactory = new Contract(dstConfig.escrowFactory, ESCROW_FACTORY_ABI, dstWallet);
    
    // Calculate timelock (5 minutes from now)
    const timelock = Math.floor(Date.now() / 1000) + 300;
    
    console.log(`[Resolver ${this.config.index}] Deploying source escrow on chain ${srcChainId}...`);
    
    // Deploy source escrow
    const srcTx = await srcFactory.deploySrcEscrow(
      orderId,
      this.wallet.address,
      orderData.swapRequest.userAddress,
      orderData.swapRequest.srcToken,
      orderData.swapRequest.srcAmount,
      orderData.swapRequest.secretHash,
      timelock,
      { value: safetyDeposit }
    );
    
    console.log(`[Resolver ${this.config.index}] Source escrow tx: ${srcTx.hash}`);
    const srcReceipt = await srcTx.wait();
    const srcSafetyDepositTx = srcTx.hash;
    
    // Get deployed escrow address from event or call getter
    const srcEscrowAddress = await srcFactory.srcEscrows(orderId);
    console.log(`[Resolver ${this.config.index}] Source escrow deployed at: ${srcEscrowAddress}`);
    
    console.log(`[Resolver ${this.config.index}] Deploying destination escrow on chain ${dstChainId}...`);
    
    // Deploy destination escrow
    const dstTx = await dstFactory.deployDstEscrow(
      orderId,
      this.wallet.address,
      orderData.swapRequest.userAddress,
      orderData.swapRequest.dstToken,
      orderData.acceptedPrice, // Amount of dst tokens resolver will provide
      orderData.swapRequest.secretHash,
      timelock,
      { value: safetyDeposit }
    );
    
    console.log(`[Resolver ${this.config.index}] Destination escrow tx: ${dstTx.hash}`);
    const dstReceipt = await dstTx.wait();
    const dstSafetyDepositTx = dstTx.hash;
    
    // Get deployed escrow address
    const dstEscrowAddress = await dstFactory.dstEscrows(orderId);
    console.log(`[Resolver ${this.config.index}] Destination escrow deployed at: ${dstEscrowAddress}`);
    
    // Store tx hashes for notification
    (orderData as any).srcSafetyDepositTx = srcSafetyDepositTx;
    (orderData as any).dstSafetyDepositTx = dstSafetyDepositTx;
    
    return {
      srcEscrow: srcEscrowAddress,
      dstEscrow: dstEscrowAddress
    };
  }

  private async notifyEscrowsReady(
    orderId: string,
    escrows: { srcEscrow: string; dstEscrow: string },
    orderData: any
  ): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Notifying relayer that escrows are ready`);
    
    await axios.post(`${this.config.relayerUrl}/api/escrows-ready`, {
      orderId,
      resolverAddress: this.wallet.address,
      srcEscrowAddress: escrows.srcEscrow,
      dstEscrowAddress: escrows.dstEscrow,
      srcSafetyDepositTx: orderData.srcSafetyDepositTx,
      dstSafetyDepositTx: orderData.dstSafetyDepositTx,
      timestamp: Date.now()
    });
  }

  private async waitForUserFundsTransfer(orderId: string): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Waiting for user funds transfer...`);
    
    // TODO: Implement actual monitoring of user funds transfer
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  private async transferDestinationTokens(
    orderId: string,
    orderData: any,
    acceptedPrice: string,
    dstEscrowAddress: string
  ): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Transferring destination tokens to escrow`);
    
    const dstChainId = orderData.swapRequest.dstChainId;
    const dstProvider = this.providers.get(dstChainId);
    
    if (!dstProvider) {
      throw new Error("Destination chain provider not found");
    }
    
    const dstWallet = this.wallet.connect(dstProvider);
    
    // Get token contract
    const dstToken = new Contract(orderData.swapRequest.dstToken, ERC20_ABI, dstWallet);
    
    // Calculate amount to transfer based on accepted price
    const priceFloat = parseFloat(acceptedPrice);
    const srcAmountFloat = parseFloat(formatUnits(orderData.swapRequest.srcAmount, 6));
    const dstAmountFloat = srcAmountFloat * priceFloat;
    const dstAmount = parseUnits(dstAmountFloat.toFixed(6), 6);
    
    console.log(`[Resolver ${this.config.index}] Approving ${formatUnits(dstAmount, 6)} tokens to escrow`);
    
    // Approve escrow to spend tokens
    const approveTx = await dstToken.approve(dstEscrowAddress, dstAmount);
    await approveTx.wait();
    
    console.log(`[Resolver ${this.config.index}] Transferring ${formatUnits(dstAmount, 6)} tokens to escrow`);
    
    // Transfer tokens to escrow
    const transferTx = await dstToken.transfer(dstEscrowAddress, dstAmount);
    const receipt = await transferTx.wait();
    
    console.log(`[Resolver ${this.config.index}] Tokens transferred. Tx: ${transferTx.hash}`);
    
    // Store tx hash for notification
    (orderData as any).dstTokenTransferTx = transferTx.hash;
  }

  private async notifyCompletion(
    orderId: string,
    orderData: any,
    acceptedPrice: string
  ): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Notifying relayer of trade completion`);
    
    // Calculate actual dst amount
    const priceFloat = parseFloat(acceptedPrice);
    const srcAmountFloat = parseFloat(formatUnits(orderData.swapRequest.srcAmount, 6));
    const dstAmountFloat = srcAmountFloat * priceFloat;
    const dstAmount = dstAmountFloat.toFixed(6);
    
    await axios.post(`${this.config.relayerUrl}/api/notify-completion`, {
      orderId,
      resolverAddress: this.wallet.address,
      dstTxHash: orderData.dstTokenTransferTx,
      dstTokenAmount: dstAmount,
      timestamp: Date.now()
    });
    
    console.log(`[Resolver ${this.config.index}] Waiting for secret reveal on destination chain...`);
    
    // TODO: Monitor for secret reveal and withdraw from source escrow
  }
}

// Main entry point
async function main() {
  const resolverIndex = parseInt(process.env.RESOLVER_INDEX || "0");
  
  if (resolverIndex < 0 || resolverIndex > 3) {
    throw new Error("RESOLVER_INDEX must be between 0 and 3");
  }
  
  const privateKey = process.env[`RESOLVER_PRIVATE_KEY_${resolverIndex}`];
  
  if (!privateKey) {
    throw new Error(`RESOLVER_PRIVATE_KEY_${resolverIndex} not found in environment`);
  }
  
  const resolver = new PollingResolverService({
    index: resolverIndex,
    privateKey,
    relayerUrl: process.env.RELAYER_URL || "http://localhost:3000",
    minProfitMargin: 0.01, // 1% minimum profit
    supportedChains: [84532, 421614, 11155111, 10143],
    pollingInterval: 3000 // Poll every 3 seconds
  });
  
  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log(`\n[Resolver ${resolverIndex}] Received SIGINT, shutting down gracefully...`);
    resolver.stop();
    process.exit(0);
  });
  
  // Start the resolver
  await resolver.start();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("[Resolver] Fatal error:", error);
    process.exit(1);
  });
}