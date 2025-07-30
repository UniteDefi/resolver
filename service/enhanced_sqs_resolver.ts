import { ethers, formatUnits, parseUnits, Wallet, Contract, JsonRpcProvider } from "ethers";
import dotenv from "dotenv";
import axios from "axios";
import { SQSListenerService, SQSOrderMessage } from "./sqs_listener_service";
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
}

// ERC20 ABI for balance checking
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export class EnhancedSQSResolverService {
  private sqsListener: SQSListenerService;
  private config: ResolverConfig;
  private wallet: Wallet;
  private processingOrders: Set<string> = new Set();
  private chainConfigs: Map<number, ChainConfig> = new Map();
  private providers: Map<number, JsonRpcProvider> = new Map();

  constructor(config: ResolverConfig) {
    this.config = config;
    this.wallet = new Wallet(config.privateKey);
    this.sqsListener = new SQSListenerService();

    // Set up message handler
    this.sqsListener.setMessageHandler(this.handleOrder.bind(this));

    // Initialize chain configs
    this.initializeChainConfigs();

    console.log(`[Resolver ${config.index}] Initialized`);
    console.log(
      `[Resolver ${config.index}] Wallet Address: ${this.wallet.address}`
    );
    console.log(
      `[Resolver ${config.index}] Supported chains: ${config.supportedChains}`
    );
    
    // Display resolver contract addresses from deployments
    this.displayResolverContracts();
  }

  private initializeChainConfigs() {
    const evmDeployments = allDeployments.evm;

    // Process Ethereum Sepolia
    if (evmDeployments.eth_sepolia) {
      const deployment = evmDeployments.eth_sepolia;
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

    // Process Base Sepolia
    if (evmDeployments.base_sepolia) {
      const deployment = evmDeployments.base_sepolia;
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

    // Process Arbitrum Sepolia
    if (evmDeployments.arb_sepolia) {
      const deployment = evmDeployments.arb_sepolia;
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

    // Process Monad Testnet
    if (evmDeployments.monad_testnet) {
      const deployment = evmDeployments.monad_testnet;
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

  private displayResolverContracts(): void {
    const resolverKey = this.config.index === 0 ? "Resolver" : `Resolver_${this.config.index + 1}`;
    console.log(`\n[Resolver ${this.config.index}] Contract Addresses:`);
    console.log("─".repeat(40));
    
    const evmDeployments = allDeployments.evm;
    
    // Check each chain for resolver contract
    if (evmDeployments.eth_sepolia?.[resolverKey]) {
      console.log(`  Ethereum Sepolia: ${evmDeployments.eth_sepolia[resolverKey]}`);
    }
    if (evmDeployments.base_sepolia?.[resolverKey]) {
      console.log(`  Base Sepolia: ${evmDeployments.base_sepolia[resolverKey]}`);
    }
    if (evmDeployments.arb_sepolia?.[resolverKey]) {
      console.log(`  Arbitrum Sepolia: ${evmDeployments.arb_sepolia[resolverKey]}`);
    }
    if (evmDeployments.monad_testnet?.[resolverKey]) {
      console.log(`  Monad Testnet: ${evmDeployments.monad_testnet[resolverKey]}`);
    }
  }

  async displayBalances(): Promise<void> {
    console.log(
      `\n[Resolver ${this.config.index}] Token Balances for ${this.wallet.address}`
    );
    console.log("═".repeat(80));

    for (const [chainId, config] of this.chainConfigs) {
      const provider = this.providers.get(chainId)!;

      try {
        console.log(`\n${config.name} (Chain ID: ${chainId})`);
        console.log("─".repeat(40));

        // Get MockWrappedNative balance
        await this.displayTokenBalance(
          provider,
          config.wrappedNative,
          "MockWrappedNative",
          18
        );
        
        // Get USDT balance (MockERC20)
        await this.displayTokenBalance(provider, config.usdt, "USDT", 6);
        
        // Get DAI balance (MockERC20_2)
        await this.displayTokenBalance(provider, config.dai, "DAI", 18);
      } catch (error) {
        console.error(`  Error fetching balances: ${error.message}`);
      }
    }

    console.log("\n" + "═".repeat(80));
  }

  private async displayTokenBalance(
    provider: JsonRpcProvider,
    tokenAddress: string,
    tokenName: string,
    decimals: number
  ): Promise<void> {
    try {
      const token = new Contract(tokenAddress, ERC20_ABI, provider);
      const balance = await token.balanceOf(this.wallet.address);
      const formattedBalance = formatUnits(balance, decimals);
      console.log(`  ${tokenName}: ${formattedBalance}`);
    } catch (error) {
      console.log(`  ${tokenName}: Error fetching balance`);
    }
  }

  async start(): Promise<void> {
    console.log(
      `[Resolver ${this.config.index}] Starting enhanced SQS resolver service...`
    );

    // Display balances on startup
    await this.displayBalances();

    // Start listening for orders
    await this.sqsListener.startListening();
  }

  stop(): void {
    console.log(`[Resolver ${this.config.index}] Stopping resolver service...`);
    this.sqsListener.stopListening();
  }

  private async handleOrder(orderMessage: SQSOrderMessage): Promise<void> {
    const {
      orderId,
      orderData,
      timestamp,
      auctionStartPrice,
      auctionEndPrice,
      auctionDuration,
    } = orderMessage;

    // Check if we're already processing this order
    if (this.processingOrders.has(orderId)) {
      console.log(
        `[Resolver ${this.config.index}] Already processing order ${orderId}, skipping`
      );
      return;
    }

    this.processingOrders.add(orderId);

    try {
      // Check if we support both chains
      if (
        !this.config.supportedChains.includes(
          orderData.swapRequest.srcChainId
        ) ||
        !this.config.supportedChains.includes(orderData.swapRequest.dstChainId)
      ) {
        console.log(
          `[Resolver ${this.config.index}] Unsupported chains for order ${orderId}`
        );
        return;
      }

      // Calculate current auction price
      const currentPrice = this.sqsListener.calculateCurrentPrice(
        auctionStartPrice,
        auctionEndPrice,
        auctionDuration,
        timestamp
      );

      console.log(
        `[Resolver ${this.config.index}] Current auction price for order ${orderId}: ${currentPrice}`
      );

      // Check profitability
      const isProfitable = await this.checkProfitability(
        orderData,
        currentPrice
      );
      if (!isProfitable) {
        console.log(
          `[Resolver ${this.config.index}] Order ${orderId} not profitable at current price`
        );
        return;
      }

      // Commit to the order
      await this.commitToOrder(orderId, currentPrice);
    } catch (error) {
      console.error(
        `[Resolver ${this.config.index}] Error handling order ${orderId}:`,
        error
      );
    } finally {
      this.processingOrders.delete(orderId);
    }
  }

  private async checkProfitability(
    orderData: any,
    currentPrice: string
  ): Promise<boolean> {
    const srcAmount = parseUnits(
      orderData.swapRequest.srcAmount,
      6
    );
    const dstAmount = parseUnits(currentPrice, 6);

    // For this example, we'll accept if we get at least minProfitMargin
    const minAcceptable = srcAmount * BigInt(Math.floor((1 - this.config.minProfitMargin) * 10000)) / 10000n;

    return dstAmount >= minAcceptable;
  }

  private async commitToOrder(
    orderId: string,
    acceptedPrice: string
  ): Promise<void> {
    try {
      console.log(
        `[Resolver ${this.config.index}] Committing to order ${orderId} at price ${acceptedPrice}`
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
          `[Resolver ${this.config.index}] Successfully committed to order ${orderId}`
        );

        // Start the execution flow
        await this.executeOrder(orderId, acceptedPrice);
      }
    } catch (error: any) {
      console.error(
        `[Resolver ${this.config.index}] Failed to commit to order ${orderId}:`,
        error.response?.data || error.message
      );
    }
  }

  private async executeOrder(
    orderId: string,
    acceptedPrice: string
  ): Promise<void> {
    console.log(
      `[Resolver ${this.config.index}] TODO: Execute order ${orderId} at price ${acceptedPrice}`
    );
    // Integration with resolver logic will go here
  }
}

// Main entry point
async function main() {
  // Get resolver index from environment
  const resolverIndex = parseInt(process.env.RESOLVER_INDEX || "0");

  if (resolverIndex < 0 || resolverIndex > 3) {
    throw new Error("RESOLVER_INDEX must be between 0 and 3");
  }

  // Get the private key for this resolver
  const privateKey = process.env[`RESOLVER_PRIVATE_KEY_${resolverIndex}`];

  if (!privateKey) {
    throw new Error(
      `RESOLVER_PRIVATE_KEY_${resolverIndex} not found in environment`
    );
  }

  const resolver = new EnhancedSQSResolverService({
    index: resolverIndex,
    privateKey,
    relayerUrl: process.env.RELAYER_URL || "http://localhost:3001",
    minProfitMargin: 0.01, // 1% minimum profit
    supportedChains: [84532, 421614, 11155111, 10143], // Base Sepolia, Arbitrum Sepolia, Ethereum Sepolia, Monad
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log(
      `\n[Resolver ${resolverIndex}] Received SIGINT, shutting down gracefully...`
    );
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
