import {
  formatUnits,
  parseUnits,
  Wallet,
  Contract,
  JsonRpcProvider,
  ethers,
  Signature,
} from "ethers";
import dotenv from "dotenv";
import axios from "axios";
import * as Sdk from "@1inch/cross-chain-sdk";
import { uint8ArrayToHex, UINT_40_MAX } from "@1inch/byte-utils";
import { createTestnetCrossChainOrder } from "./utils/testnet-cross-chain-order";
import { SQSListenerService, SQSOrderMessage } from "./sqs_listener_service";
import allDeployments from "../deployments.json";

dotenv.config();

const { Address } = Sdk;

interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  wrappedNative: string;
  usdt: string;
  dai: string;
  escrowFactory: string;
  limitOrderProtocol: string;
  resolverContracts: string[];
}

interface ResolverConfig {
  index: number;
  privateKey: string;
  relayerUrl: string;
  minProfitMargin: number;
  supportedChains: number[];
}

// ERC20 ABI for balance checking and transfers
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

// Resolver contract ABI - for deploying escrows through resolver
const RESOLVER_ABI = [
  "function deploySrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, uint256 maker, uint256 receiver, uint256 makerAsset, uint256 takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 makerTraits) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits, bytes args) payable",
  "function deployDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) dstImmutables, uint256 srcCancellationTimestamp) payable",
  "function withdraw(address escrow, bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)",
  "function cancel(address escrow, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables)",
  "function arbitraryCalls(address[] targets, bytes[] arguments)",
];

// Escrow Factory ABI - for getting escrow addresses
const ESCROW_FACTORY_ABI = [
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
  "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) view returns (address)",
  "event SrcEscrowCreated(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 maker, uint256 amount, uint256 token, uint256 safetyDeposit, uint32 chainId) complement)",
  "event DstEscrowCreated(address escrow, bytes32 hashlock, uint256 taker)",
];


// TypeScript interfaces for the structs
interface ImmutablesStruct {
  orderHash: string;
  hashlock: string;
  maker: string; // uint256 representation of address
  taker: string; // uint256 representation of address
  token: string; // uint256 representation of address
  amount: string;
  safetyDeposit: string;
  timelocks: string; // uint256 packed timelocks
}

// Keep old interfaces for compatibility
interface Timelocks {
  srcWithdrawal: number;
  srcCancellation: number;
  srcPublicWithdrawal: number;
  srcPublicCancellation: number;
  dstWithdrawal: number;
  dstCancellation: number;
  dstPublicWithdrawal: number;
  deployedAt: number;
}

interface Immutables {
  orderHash: string;
  hashlock: string;
  maker: string;
  taker: string;
  token: string;
  amount: string;
  safetyDeposit: string;
  timelocks: Timelocks;
}

export class EnhancedSQSResolverService {
  private sqsListener: SQSListenerService;
  private config: ResolverConfig;
  private wallet: Wallet;
  private processingOrders: Set<string> = new Set();
  private chainConfigs: Map<number, ChainConfig> = new Map();
  private providers: Map<number, JsonRpcProvider> = new Map();
  private tokenDecimals: Map<string, number> = new Map(); // Cache for token decimals

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
        limitOrderProtocol: deployment.LimitOrderProtocol,
        resolverContracts: [
          deployment.Resolver,
          deployment.Resolver_2,
          deployment.Resolver_3,
          deployment.Resolver_4
        ].filter(Boolean)
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
        limitOrderProtocol: deployment.LimitOrderProtocol,
        resolverContracts: [
          deployment.Resolver,
          deployment.Resolver_2,
          deployment.Resolver_3,
          deployment.Resolver_4
        ].filter(Boolean)
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
        limitOrderProtocol: deployment.LimitOrderProtocol,
        resolverContracts: [
          deployment.Resolver,
          deployment.Resolver_2,
          deployment.Resolver_3,
          deployment.Resolver_4
        ].filter(Boolean)
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
        limitOrderProtocol: deployment.LimitOrderProtocol,
        resolverContracts: [
          deployment.Resolver,
          deployment.Resolver_2,
          deployment.Resolver_3,
          deployment.Resolver_4
        ].filter(Boolean)
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
  
  // Helper function to convert address to uint256 representation
  private addressToUint256(address: string): string {
    // Remove 0x prefix and pad to 64 characters
    const cleanAddress = address.toLowerCase().replace("0x", "");
    return "0x" + cleanAddress.padStart(64, "0");
  }
  
  // Helper function to create packed timelocks as uint256
  private createTimelocksUint256(): string {
    const now = Math.floor(Date.now() / 1000);
    const duration = 300; // 5 minutes
    
    // Pack timelocks into a single uint256
    // Format: [srcWithdrawal(32), srcCancellation(32), srcPublicWithdrawal(32), srcPublicCancellation(32), dstWithdrawal(32), dstCancellation(32), dstPublicWithdrawal(32), deployedAt(32)]
    const timelocks = {
      srcWithdrawal: now + 60,
      srcCancellation: now + duration,
      srcPublicWithdrawal: now + 120,
      srcPublicCancellation: now + duration + 60,
      dstWithdrawal: now + 60,
      dstCancellation: now + duration - 60,
      dstPublicWithdrawal: now + 120,
      deployedAt: now
    };
    
    // Pack into single uint256 (each gets 32 bits)
    let packed = BigInt(0);
    packed |= BigInt(timelocks.srcWithdrawal) << BigInt(224);
    packed |= BigInt(timelocks.srcCancellation) << BigInt(192);
    packed |= BigInt(timelocks.srcPublicWithdrawal) << BigInt(160);
    packed |= BigInt(timelocks.srcPublicCancellation) << BigInt(128);
    packed |= BigInt(timelocks.dstWithdrawal) << BigInt(96);
    packed |= BigInt(timelocks.dstCancellation) << BigInt(64);
    packed |= BigInt(timelocks.dstPublicWithdrawal) << BigInt(32);
    packed |= BigInt(timelocks.deployedAt);
    
    return "0x" + packed.toString(16).padStart(64, "0");
  }
  
  // Helper to create makerTraits uint256
  private createMakerTraits(escrowFactory: string, allowPartialFills: boolean = false, allowMultipleFills: boolean = false): string {
    // MakerTraits packing (simplified):
    // - bits 0-159: extension (escrow factory address)
    // - bit 254: allowPartialFills
    // - bit 255: allowMultipleFills
    let traits = BigInt(escrowFactory);
    if (allowPartialFills) traits |= BigInt(1) << BigInt(254);
    if (allowMultipleFills) traits |= BigInt(1) << BigInt(255);
    return "0x" + traits.toString(16).padStart(64, "0");
  }
  
  // Helper to create a simple CrossChainOrder-like structure
  private createOrderStruct(orderData: any, escrowFactory: string): any {
    const userAddress = orderData.userAddress || orderData.swapRequest?.userAddress;
    const srcToken = orderData.srcToken || orderData.swapRequest?.srcToken;
    const dstToken = orderData.dstToken || orderData.swapRequest?.dstToken;
    const srcAmount = orderData.srcAmount || orderData.swapRequest?.srcAmount;
    const dstAmount = orderData.dstAmount || orderData.swapRequest?.dstAmount;
    
    return {
      salt: BigInt(Date.now()).toString(),
      maker: this.addressToUint256(userAddress),
      receiver: this.addressToUint256(userAddress), // Same as maker
      makerAsset: this.addressToUint256(srcToken),
      takerAsset: this.addressToUint256(dstToken),
      makingAmount: srcAmount,
      takingAmount: dstAmount,
      makerTraits: this.createMakerTraits(escrowFactory)
    };
  }

  private displayResolverContracts(): void {
    const resolverKey =
      this.config.index === 0
        ? "Resolver"
        : `Resolver_${this.config.index + 1}`;
    console.log(`\n[Resolver ${this.config.index}] Contract Addresses:`);
    console.log("─".repeat(40));

    const evmDeployments = allDeployments.evm;

    // Check each chain for resolver contract
    if (evmDeployments.eth_sepolia?.[resolverKey]) {
      console.log(
        `  Ethereum Sepolia: ${evmDeployments.eth_sepolia[resolverKey]}`
      );
    }
    if (evmDeployments.base_sepolia?.[resolverKey]) {
      console.log(
        `  Base Sepolia: ${evmDeployments.base_sepolia[resolverKey]}`
      );
    }
    if (evmDeployments.arb_sepolia?.[resolverKey]) {
      console.log(
        `  Arbitrum Sepolia: ${evmDeployments.arb_sepolia[resolverKey]}`
      );
    }
    if (evmDeployments.monad_testnet?.[resolverKey]) {
      console.log(
        `  Monad Testnet: ${evmDeployments.monad_testnet[resolverKey]}`
      );
    }
  }

  private getResolverContractAddress(chainId: number): string {
    const chainConfig = this.chainConfigs.get(chainId);
    if (!chainConfig || !chainConfig.resolverContracts) {
      throw new Error(`No resolver contracts found for chain ${chainId}`);
    }
    
    const resolverAddress = chainConfig.resolverContracts[this.config.index];
    if (!resolverAddress) {
      throw new Error(`No resolver contract at index ${this.config.index} for chain ${chainId}`);
    }
    
    return resolverAddress;
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
        console.error(`  Error fetching balances: ${(error as Error).message}`);
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

  private async getTokenDecimals(
    tokenAddress: string,
    chainId: number
  ): Promise<number> {
    // Check cache first
    const cacheKey = `${chainId}-${tokenAddress.toLowerCase()}`;
    if (this.tokenDecimals.has(cacheKey)) {
      return this.tokenDecimals.get(cacheKey)!;
    }

    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new Error(`No provider for chain ${chainId}`);
      }

      const token = new Contract(tokenAddress, ERC20_ABI, provider);
      const decimals = await token.decimals();
      const decimalsNumber = Number(decimals);
      
      // Cache the result
      this.tokenDecimals.set(cacheKey, decimalsNumber);
      
      console.log(
        `[Resolver ${this.config.index}] Fetched decimals for token ${tokenAddress} on chain ${chainId}: ${decimalsNumber}`
      );
      
      return decimalsNumber;
    } catch (error) {
      console.error(
        `[Resolver ${this.config.index}] Error fetching decimals for token ${tokenAddress}:`,
        error
      );
      // Default to common values based on token type
      // This is a fallback - ideally we should always get decimals from contract
      if (tokenAddress.toLowerCase().includes('usdt') || 
          tokenAddress.toLowerCase().includes('usdc')) {
        return 6;
      }
      return 18; // Default for most ERC20 tokens
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

  private async handleOrder(
    orderMessage: SQSOrderMessage,
    receiptHandle?: string
  ): Promise<void> {
    const {
      orderId,
      orderData,
      timestamp,
      auctionStartPrice,
      auctionEndPrice,
      auctionDuration,
      srcTokenDecimals,
      dstTokenDecimals,
    } = orderMessage;
    
    // Ensure orderData has proper structure
    const fullOrderData = {
      ...orderData,
      srcChainId: orderData.srcChainId || orderData.swapRequest?.srcChainId,
      dstChainId: orderData.dstChainId || orderData.swapRequest?.dstChainId,
      srcToken: orderData.srcToken || orderData.swapRequest?.srcToken,
      dstToken: orderData.dstToken || orderData.swapRequest?.dstToken,
      srcAmount: orderData.srcAmount || orderData.swapRequest?.srcAmount,
      userAddress: orderData.userAddress || orderData.swapRequest?.userAddress,
      secretHash: orderData.secretHash || orderData.swapRequest?.secretHash,
    };

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
        !this.config.supportedChains.includes(fullOrderData.srcChainId) ||
        !this.config.supportedChains.includes(fullOrderData.dstChainId)
      ) {
        console.log(
          `[Resolver ${this.config.index}] Unsupported chains for order ${orderId}`
        );
        return;
      }
      let currentPrice: string = auctionStartPrice;
      let isProfitable = false;
      const auctionStartTime = timestamp;
      const auctionEndTime = timestamp + (auctionDuration * 1000); // Convert seconds to milliseconds

      console.log(
        `[Resolver ${this.config.index}] Starting auction monitoring for order ${orderId}`,
        {
          startTime: new Date(auctionStartTime).toISOString(),
          endTime: new Date(auctionEndTime).toISOString(),
          duration: `${auctionDuration} seconds`,
          startPrice: auctionStartPrice,
          endPrice: auctionEndPrice,
        }
      );

      while (!isProfitable) {
        const currentTime = Date.now();
        const elapsedTime = currentTime - auctionStartTime;
        
        // Check if auction duration has exceeded
        if (elapsedTime >= auctionDuration * 1000) {
          console.log(
            `[Resolver ${this.config.index}] Auction duration exceeded for order ${orderId}`,
            {
              elapsed: `${elapsedTime / 1000} seconds`,
              duration: `${auctionDuration} seconds`,
            }
          );
          
          // Delete the expired message from SQS
          if (receiptHandle) {
            try {
              await this.sqsListener.deleteMessage(receiptHandle);
              console.log(
                `[Resolver ${this.config.index}] Deleted expired order ${orderId} from SQS`
              );
            } catch (deleteError) {
              console.error(
                `[Resolver ${this.config.index}] Failed to delete expired message:`,
                deleteError
              );
            }
          }
          return;
        }

        // Get current auction price from relayer
        try {
          const priceResponse = await axios.get(
            `${this.config.relayerUrl}/api/auction-price/${orderId}`
          );
          
          if (priceResponse.data && priceResponse.data.currentPrice) {
            // Convert from internal format (with 6 decimals) to human-readable format
            currentPrice = formatUnits(priceResponse.data.currentPrice, 6);
            
            const remainingTime = (auctionEndTime - currentTime) / 1000;
            console.log(
              `[Resolver ${this.config.index}] Auction status for order ${orderId}:`,
              {
                currentPrice: `${currentPrice} DAI per USDT`,
                elapsed: `${Math.floor(elapsedTime / 1000)}s`,
                remaining: `${Math.floor(remainingTime)}s`,
                progress: `${Math.floor((elapsedTime / (auctionDuration * 1000)) * 100)}%`,
              }
            );

            // Check profitability
            isProfitable = await this.checkProfitability(fullOrderData, currentPrice, srcTokenDecimals, dstTokenDecimals);
          } else {
            console.error(`[Resolver ${this.config.index}] Invalid price response from relayer`);
            continue;
          }
        } catch (error) {
          console.error(`[Resolver ${this.config.index}] Error getting auction price:`, error);
          continue;
        }

        if (!isProfitable) {
          console.log(
            `[Resolver ${this.config.index}] Order ${orderId} not profitable yet, waiting...`
          );

          // Wait for a short interval before recalculating
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Commit to the order
      // Get the exact current price from relayer one more time to ensure we commit at the exact current price
      try {
        const finalPriceResponse = await axios.get(
          `${this.config.relayerUrl}/api/auction-price/${orderId}`
        );
        
        if (finalPriceResponse.data && finalPriceResponse.data.currentPrice) {
          // Use the exact price from relayer (already in internal format with 6 decimals)
          const priceInternal = finalPriceResponse.data.currentPrice;
          await this.commitToOrder(orderId, priceInternal, receiptHandle, fullOrderData);
        } else {
          console.error(`[Resolver ${this.config.index}] Failed to get final price for commit`);
          return;
        }
      } catch (error) {
        console.error(`[Resolver ${this.config.index}] Error getting final price for commit:`, error);
        return;
      }
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
    currentPrice: string,
    srcTokenDecimals?: number,
    dstTokenDecimals?: number
  ): Promise<boolean> {
    // currentPrice represents how many destination tokens per 1 source token
    // e.g., "95.5" means 1 USDT = 95.5 DAI
    
    const srcAmountRaw = orderData.swapRequest.srcAmount; // e.g., "100000000" (100 USDT with 6 decimals)
    const srcAmount = BigInt(srcAmountRaw);
    
    // Get token decimals - use provided values or fetch dynamically
    const srcToken = orderData.swapRequest.srcToken;
    const dstToken = orderData.swapRequest.dstToken;
    const srcChainId = orderData.swapRequest.srcChainId;
    const dstChainId = orderData.swapRequest.dstChainId;
    
    const srcDecimals = srcTokenDecimals ?? await this.getTokenDecimals(srcToken, srcChainId);
    const dstDecimals = dstTokenDecimals ?? await this.getTokenDecimals(dstToken, dstChainId);
    
    // Convert source amount to human-readable format
    const srcAmountFloat = parseFloat(formatUnits(srcAmount, srcDecimals));
    
    // Calculate destination amount using current price
    // currentPrice is already in human-readable format (e.g., "95.5")
    const priceFloat = parseFloat(currentPrice);
    const dstAmountFloat = srcAmountFloat * priceFloat;
    
    // Convert destination amount to wei with proper decimals
    // Need to limit decimal places to avoid parseUnits overflow
    const dstAmountFormatted = dstAmountFloat.toFixed(Math.min(6, dstDecimals));
    const dstAmount = parseUnits(dstAmountFormatted, dstDecimals);
    
    // For profitability analysis:
    // - Auction starts HIGH (e.g., 102 DAI per USDT) - bad for resolver
    // - Auction ends LOW (e.g., 95 DAI per USDT) - good for resolver
    // - Resolver profits when they give fewer tokens than market rate
    
    // Calculate market rate (assuming 1:1 for stablecoins)
    // Need to account for different decimals between tokens
    const marketRateFloat = srcAmountFloat; // 1:1 rate
    const marketRateFormatted = marketRateFloat.toFixed(Math.min(6, dstDecimals));
    const marketRateDst = parseUnits(marketRateFormatted, dstDecimals);
    
    // Calculate maximum amount resolver is willing to give (with profit margin)
    const maxResolverWillingToGive = 
      (marketRateDst * BigInt(10000 - Math.floor(this.config.minProfitMargin * 10000))) / 
      10000n;
    
    const isProfitable = dstAmount <= maxResolverWillingToGive;
    
    console.log(`[Resolver ${this.config.index}] Profitability check:`, {
      srcAmount: `${formatUnits(srcAmount, srcDecimals)} USDT`,
      dstAmount: `${formatUnits(dstAmount, dstDecimals)} DAI`,
      marketRate: `${formatUnits(marketRateDst, dstDecimals)} DAI`,
      currentPrice: `${currentPrice} DAI per USDT`,
      maxAcceptable: `${formatUnits(maxResolverWillingToGive, dstDecimals)} DAI`,
      profitMargin: `${this.config.minProfitMargin * 100}%`,
      isProfitable,
    });
    
    return isProfitable;
  }

  private async commitToOrder(
    orderId: string,
    acceptedPrice: string,
    receiptHandle?: string,
    orderData?: any
  ): Promise<void> {
    try {
      console.log(
        `[Resolver ${this.config.index}] Committing to order ${orderId} at price ${formatUnits(acceptedPrice, 6)}`
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

        // Delete the message from SQS now that we've committed
        if (receiptHandle) {
          try {
            await this.sqsListener.deleteMessage(receiptHandle);
            console.log(
              `[Resolver ${this.config.index}] Deleted SQS message for order ${orderId}`
            );
          } catch (deleteError) {
            console.error(
              `[Resolver ${this.config.index}] Failed to delete SQS message:`,
              deleteError
            );
          }
        }

        // Start the execution flow
        await this.executeOrder(orderId, acceptedPrice, orderData);
      }
    } catch (error: any) {
      console.error(
        `[Resolver ${this.config.index}] Failed to commit to order ${orderId}:`,
        error.response?.data || error.message
      );
    }
  }

  private async fetchOrderData(orderId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.config.relayerUrl}/api/order-status/${orderId}`
      );
      
      if (!response.data) {
        throw new Error("Order not found");
      }
      
      // Also fetch the full active order data for complete swap request details
      const activeOrdersResponse = await axios.get(
        `${this.config.relayerUrl}/api/active-orders`
      );
      
      const fullOrder = activeOrdersResponse.data.find(
        (order: any) => order.orderId === orderId
      );
      
      if (!fullOrder) {
        // If not in active orders, it might be committed - construct from status
        return {
          orderId: response.data.orderId,
          status: response.data.status,
          swapRequest: {
            userAddress: response.data.userAddress || "",
            srcChainId: response.data.srcChainId || 0,
            srcToken: response.data.srcToken || "",
            srcAmount: response.data.srcAmount || "0",
            dstChainId: response.data.dstChainId || 0,
            dstToken: response.data.dstToken || "",
            secretHash: response.data.secretHash || "",
          },
          committedPrice: response.data.committedPrice,
          resolver: response.data.resolver,
        };
      }
      
      return fullOrder;
    } catch (error) {
      console.error(
        `[Resolver ${this.config.index}] Error fetching order data:`,
        error
      );
      throw error;
    }
  }

  private async executeOrder(
    orderId: string,
    acceptedPrice: string,
    orderData?: any
  ): Promise<void> {
    console.log(
      `[Resolver ${this.config.index}] Starting order execution for ${orderId} at price ${formatUnits(acceptedPrice, 6)}`
    );
    
    try {
      // Step 1: Fetch full order data if not provided
      if (!orderData) {
        orderData = await this.fetchOrderData(orderId);
      }
      
      // Ensure we have the chain IDs
      if (!orderData.srcChainId && orderData.swapRequest) {
        orderData.srcChainId = orderData.swapRequest.srcChainId;
        orderData.dstChainId = orderData.swapRequest.dstChainId;
      }
      
      console.log(
        `[Resolver ${this.config.index}] Retrieved order data for ${orderId}`,
        {
          srcChainId: orderData.srcChainId || orderData.swapRequest?.srcChainId,
          dstChainId: orderData.dstChainId || orderData.swapRequest?.dstChainId,
        }
      );
      
      // Step 2: Deploy escrows on both chains
      const escrows = await this.deployEscrows(orderId, orderData, acceptedPrice);
      
      // Step 3: Notify relayer that escrows are ready
      await this.notifyEscrowsReady(orderId, escrows, orderData);
      
      // Step 4: Wait for relayer to transfer user funds
      await this.waitForUserFundsTransfer(orderId);
      
      // Step 5: Transfer destination tokens to destination escrow
      await this.transferDestinationTokens(orderId, orderData, acceptedPrice, escrows.dstEscrow);
      
      // Step 6: Notify completion
      await this.notifyCompletion(orderId, orderData, acceptedPrice);
      
      // Step 7: Monitor for secret reveal and withdraw from source escrow
      await this.monitorAndWithdraw(orderId, orderData, escrows.srcEscrow, escrows.immutables);
      
      console.log(
        `[Resolver ${this.config.index}] Successfully completed order ${orderId}!`
      );
      
    } catch (error) {
      console.error(
        `[Resolver ${this.config.index}] Error executing order ${orderId}:`,
        error
      );
      // In production, should handle rollback/recovery here
    }
  }

  private async deployEscrows(
    orderId: string,
    orderData: any,
    acceptedPrice: string
  ): Promise<{ srcEscrow: string; dstEscrow: string; srcDepositTx: string; dstDepositTx: string; immutables: Immutables }> {
    console.log(`[Resolver ${this.config.index}] Deploying escrows for order ${orderId} using SDK`);
    
    const srcChainId = orderData.srcChainId || orderData.swapRequest.srcChainId;
    const dstChainId = orderData.dstChainId || orderData.swapRequest.dstChainId;
    
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
    
    // Get resolver contract addresses
    const srcResolverAddress = this.getResolverContractAddress(srcChainId);
    const dstResolverAddress = this.getResolverContractAddress(dstChainId);
    
    console.log(`[Resolver ${this.config.index}] Using resolver contracts:`, {
      srcChain: srcChainId,
      srcResolver: srcResolverAddress,
      dstChain: dstChainId,
      dstResolver: dstResolverAddress,
    });
    
    // Get resolver contracts
    const srcResolver = new Contract(srcResolverAddress, RESOLVER_ABI, srcWallet);
    const dstResolver = new Contract(dstResolverAddress, RESOLVER_ABI, dstWallet);
    
    // Get escrow factory contracts
    const srcFactory = new Contract(srcConfig.escrowFactory, ESCROW_FACTORY_ABI, srcProvider);
    const dstFactory = new Contract(dstConfig.escrowFactory, ESCROW_FACTORY_ABI, dstProvider);
    
    // Extract order data
    const userAddress = orderData.userAddress || orderData.swapRequest?.userAddress;
    const srcToken = orderData.srcToken || orderData.swapRequest?.srcToken;
    const dstToken = orderData.dstToken || orderData.swapRequest?.dstToken;
    const srcAmount = BigInt(orderData.srcAmount || orderData.swapRequest?.srcAmount);
    
    // Calculate destination amount based on accepted price
    const priceFloat = parseFloat(formatUnits(acceptedPrice, 6));
    const srcAmountFloat = parseFloat(formatUnits(srcAmount, 6));
    const dstAmountFloat = srcAmountFloat * priceFloat;
    const dstAmount = parseUnits(dstAmountFloat.toFixed(6), 6);
    
    // Generate secret
    const secret = orderData.secret || ethers.hexlify(ethers.randomBytes(32));
    const secretHash = ethers.keccak256(secret);
    console.log(`[Resolver ${this.config.index}] Using secret hash: ${secretHash}`);
    
    // Store secret for later withdrawal
    (orderData as any).resolverSecret = secret;
    
    // Get current timestamp
    const currentBlock = await srcProvider.getBlock('latest');
    const srcTimestamp = BigInt(currentBlock!.timestamp);
    
    // Create cross-chain order - try SDK first, fallback to testnet helper
    let order: any;
    let isUsingTestnetHelper = false;
    
    // Check if we can use the existing SDK order data  
    if (orderData.sdkOrder && orderData.sdkOrder.orderData) {
      console.log(`[Resolver ${this.config.index}] Using existing SDK order data to preserve signature validity`);
      
      // Create a minimal wrapper that preserves the original order data
      // This ensures the signature remains valid by using the exact same order hash
      order = {
        // Core order data (must match exactly what was signed)
        ...orderData.sdkOrder.orderData,
        
        // Extension data from the original order
        extension: orderData.sdkOrder.extension,
        
        // Use the pre-computed order hash to avoid recalculation
        getOrderHash: () => orderData.sdkOrder.orderHash,
        
        // Add escrow-specific data (not part of the original signature)
        escrowExtension: {
          hashLockInfo: secretHash,
          srcSafetyDeposit: parseUnits("0.01", 18),
          dstSafetyDeposit: parseUnits("0.01", 18),
        },
        
        // Simple build method that returns the original order data
        build: () => orderData.sdkOrder.orderData,
        
        // SDK-compatible method for immutables generation
        toSrcImmutables: (chainId: any, maker: any, amount: any, hashLock: any) => {
          // Use SDK method signature but with original order hash
          return {
            orderHash: orderData.sdkOrder.orderHash,
            // Convert parameters to proper format for SDK compatibility
            withComplement: (complement: any) => ({
              maker: typeof maker === 'string' ? maker.toString() : maker.toString(),
              token: srcToken,
              amount: amount.toString(),
              safetyDeposit: parseUnits("0.01", 18).toString(),
              withTaker: (taker: any) => ({
                taker: typeof taker === 'string' ? taker.toString() : taker.toString(),
                timeLocks: {
                  toSrcTimeLocks: () => ({
                    privateCancellation: 900n, // 15 minutes
                  }),
                },
              }),
            }),
          };
        },
      };
      
      isUsingTestnetHelper = false;
    } else {
      try {
        // Try SDK first
        order = Sdk.CrossChainOrder.new(
          new Sdk.Address(srcConfig.escrowFactory),
          {
          salt: Sdk.randBigInt(1000n),
          maker: new Sdk.Address(userAddress),
          makingAmount: srcAmount,
          takingAmount: dstAmount,
          makerAsset: new Sdk.Address(srcToken),
          takerAsset: new Sdk.Address(dstToken),
        },
        {
          hashLock: Sdk.HashLock.forSingleFill(secret),
          timeLocks: Sdk.TimeLocks.new({
            srcWithdrawal: 300n, // 5 minutes
            srcPublicWithdrawal: 600n, // 10 minutes
            srcCancellation: 900n, // 15 minutes
            srcPublicCancellation: 1200n, // 20 minutes
            dstWithdrawal: 300n, // 5 minutes
            dstPublicWithdrawal: 600n, // 10 minutes
            dstCancellation: 900n, // 15 minutes
          }),
          srcChainId,
          dstChainId,
          srcSafetyDeposit: parseUnits("0.01", 18),
          dstSafetyDeposit: parseUnits("0.01", 18),
        },
        {
          auction: new Sdk.AuctionDetails({
            initialRateBump: 0,
            points: [],
            duration: BigInt(orderData.auctionDetails?.duration || 180),
            startTime: srcTimestamp,
          }),
          whitelist: [
            {
              address: new Sdk.Address(srcResolverAddress),
              allowFrom: 0n,
            },
            {
              address: new Sdk.Address(dstResolverAddress),
              allowFrom: 0n,
            },
          ],
          resolvingStartTime: 0n,
        },
        {
          nonce: Sdk.randBigInt(UINT_40_MAX),
          allowPartialFills: false,
          allowMultipleFills: false,
        }
      );
    } catch (error: any) {
      // If SDK fails (likely due to unsupported chain), use testnet helper
      console.log(`[Resolver ${this.config.index}] SDK failed, using testnet helper: ${error.message}`);
      isUsingTestnetHelper = true;
      
      order = createTestnetCrossChainOrder(
        srcConfig.escrowFactory,
        srcConfig.limitOrderProtocol,
        {
          salt: BigInt(Math.floor(Math.random() * 1000)),
          maker: userAddress,
          makingAmount: srcAmount,
          takingAmount: dstAmount,
          makerAsset: srcToken,
          takerAsset: dstToken,
        },
        {
          hashLock: secretHash,
          timeLocks: {
            srcWithdrawal: 300n,
            srcPublicWithdrawal: 600n,
            srcCancellation: 900n,
            srcPublicCancellation: 1200n,
            dstWithdrawal: 300n,
            dstPublicWithdrawal: 600n,
            dstCancellation: 900n,
          },
          srcChainId,
          dstChainId,
          srcSafetyDeposit: parseUnits("0.01", 18),
          dstSafetyDeposit: parseUnits("0.01", 18),
        },
        {
          auction: {
            initialRateBump: 0,
            duration: BigInt(orderData.auctionDetails?.duration || 180),
            startTime: srcTimestamp,
          },
          whitelist: [
            {
              address: srcResolverAddress,
              allowFrom: 0n,
            },
            {
              address: dstResolverAddress,
              allowFrom: 0n,
            },
          ],
          resolvingStartTime: 0n,
        },
        {
          nonce: BigInt(Math.floor(Math.random() * 2**40)),
          allowPartialFills: false,
          allowMultipleFills: false,
        }
      );
    }
    }
      
    const orderHash = typeof order.getOrderHash === 'function' ? order.getOrderHash(srcChainId) : order.getOrderHash();
    const extension = order.extension;
      console.log(`[Resolver ${this.config.index}] Using order with hash: ${orderHash}`);
    
    // Get order signature from orderData or create dummy signature
    // In production, this should be the actual user signature
    let signature = orderData.signature || orderData.swapRequest?.signature;
    if (!signature) {
      // Create dummy signature for testing
      const r = "0x" + "0".repeat(64);
      const s = "0x" + "0".repeat(63) + "1"; // s must be > 0
      const v = 27;
      signature = r + s.slice(2) + v.toString(16).padStart(2, '0');
    }
    
    // Deploy source escrow
    console.log(`[Resolver ${this.config.index}] Deploying source escrow...`);
    
    const { r, yParityAndS: vs } = Signature.from(signature);
    
    let takerTraitArgs: string;
    let takerTraitValue: string;
    
    if (isUsingTestnetHelper) {
      // For testnet helper, manually build taker traits
      // TakerTraits with extension flag and amount mode
      const traits = (1n << 255n) | // Has extension
                     (1n << 3n);    // Maker amount mode
      takerTraitValue = '0x' + traits.toString(16).padStart(64, '0');
      takerTraitArgs = extension; // Extension is already encoded
    } else {
      const takerTraits = Sdk.TakerTraits.default()
        .setExtension(order.extension)
        .setAmountMode(Sdk.AmountMode.maker)
        .setAmountThreshold(order.takingAmount);
      
      const encoded = takerTraits.encode();
      takerTraitArgs = encoded.args;
      takerTraitValue = encoded.trait;
    }
    const srcImmutables = isUsingTestnetHelper
      ? order.toSrcImmutables(srcResolverAddress, srcAmount, order.escrowExtension.hashLockInfo)
      : order.toSrcImmutables(
          srcChainId,
          new Sdk.Address(srcResolverAddress),
          srcAmount,
          order.escrowExtension.hashLockInfo
        );
    
    try {
      const srcTx = await srcResolver.deploySrc(
        srcImmutables.build(),
        order.build(),
        r,
        vs,
        srcAmount,
        takerTraitValue,
        takerTraitArgs,
        { value: order.escrowExtension.srcSafetyDeposit }
      );
      
      console.log(`[Resolver ${this.config.index}] Source deployment tx: ${srcTx.hash}`);
      const srcReceipt = await srcTx.wait();
      
      // Get escrow address from factory
      const srcEscrowAddress = await srcFactory.addressOfEscrowSrc(srcImmutables.build());
      console.log(`[Resolver ${this.config.index}] Source escrow deployed at: ${srcEscrowAddress}`);
      
      // Deploy destination escrow
      console.log(`[Resolver ${this.config.index}] Deploying destination escrow...`);
      
      // Create destination immutables by applying complement
      const dstImmutables = isUsingTestnetHelper
        ? srcImmutables.withComplement({
            maker: dstResolverAddress,
            amount: dstAmount,
            token: dstToken,
            safetyDeposit: order.escrowExtension.dstSafetyDeposit,
          }).withTaker(userAddress)
        : srcImmutables.withComplement({
            maker: new Sdk.Address(dstResolverAddress),
            amount: dstAmount,
            token: new Sdk.Address(dstToken),
            safetyDeposit: order.escrowExtension.dstSafetyDeposit,
          }).withTaker(new Sdk.Address(userAddress));
      
      const dstTx = await dstResolver.deployDst(
        dstImmutables.build(),
        dstImmutables.timeLocks.toSrcTimeLocks().privateCancellation,
        { value: order.escrowExtension.dstSafetyDeposit }
      );
      
      console.log(`[Resolver ${this.config.index}] Destination deployment tx: ${dstTx.hash}`);
      const dstReceipt = await dstTx.wait();
      
      // Get destination escrow address
      const dstEscrowAddress = await dstFactory.addressOfEscrowDst(dstImmutables.build());
      console.log(`[Resolver ${this.config.index}] Destination escrow deployed at: ${dstEscrowAddress}`);
      
      // Create Immutables for return (compatible with existing code)
      const immutables: Immutables = {
        orderHash: orderHash,
        hashlock: secretHash,
        maker: userAddress,
        taker: srcResolverAddress,
        token: srcToken,
        amount: srcAmount.toString(),
        safetyDeposit: order.escrowExtension.srcSafetyDeposit.toString(),
        timelocks: {
          srcWithdrawal: 300,
          srcCancellation: 900,
          srcPublicWithdrawal: 600,
          srcPublicCancellation: 1200,
          dstWithdrawal: 300,
          dstCancellation: 900,
          dstPublicWithdrawal: 600,
          deployedAt: Number(srcTimestamp)
        }
      };
      
      return {
        srcEscrow: srcEscrowAddress,
        dstEscrow: dstEscrowAddress,
        srcDepositTx: srcTx.hash,
        dstDepositTx: dstTx.hash,
        immutables
      };
    } catch (error) {
      console.error(`[Resolver ${this.config.index}] Error deploying escrows:`, error);
      throw error;
    }
  }
  
  // Helper to unpack timelocks from uint256
  private unpackTimelocks(packed: string): Timelocks {
    const value = BigInt(packed);
    return {
      srcWithdrawal: Number((value >> BigInt(224)) & BigInt(0xffffffff)),
      srcCancellation: Number((value >> BigInt(192)) & BigInt(0xffffffff)),
      srcPublicWithdrawal: Number((value >> BigInt(160)) & BigInt(0xffffffff)),
      srcPublicCancellation: Number((value >> BigInt(128)) & BigInt(0xffffffff)),
      dstWithdrawal: Number((value >> BigInt(96)) & BigInt(0xffffffff)),
      dstCancellation: Number((value >> BigInt(64)) & BigInt(0xffffffff)),
      dstPublicWithdrawal: Number((value >> BigInt(32)) & BigInt(0xffffffff)),
      deployedAt: Number(value & BigInt(0xffffffff))
    };
  }

  private async notifyEscrowsReady(
    orderId: string,
    escrows: { srcEscrow: string; dstEscrow: string; srcDepositTx: string; dstDepositTx: string; immutables: Immutables },
    orderData: any
  ): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Notifying relayer that escrows are ready`);
    
    try {
      await axios.post(`${this.config.relayerUrl}/api/escrows-ready`, {
        orderId,
        resolverAddress: this.wallet.address,
        srcEscrowAddress: escrows.srcEscrow,
        dstEscrowAddress: escrows.dstEscrow,
        srcSafetyDepositTx: escrows.srcDepositTx,
        dstSafetyDepositTx: escrows.dstDepositTx,
        timestamp: Date.now(),
      });
      
      console.log(`[Resolver ${this.config.index}] Escrows ready notification sent`);
    } catch (error) {
      console.error(`[Resolver ${this.config.index}] Error notifying escrows ready:`, error);
      throw error;
    }
  }

  private async waitForUserFundsTransfer(orderId: string): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Waiting for user funds transfer...`);
    
    const maxWaitTime = 60000; // 1 minute
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(
          `${this.config.relayerUrl}/api/order-status/${orderId}`
        );
        
        if (response.data.userFundsMoved) {
          console.log(`[Resolver ${this.config.index}] User funds transferred successfully`);
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error(`[Resolver ${this.config.index}] Error checking order status:`, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error("Timeout waiting for user funds transfer");
  }

  private async transferDestinationTokens(
    orderId: string,
    orderData: any,
    acceptedPrice: string,
    dstEscrowAddress: string
  ): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Transferring destination tokens to escrow`);
    
    const dstChainId = orderData.dstChainId || orderData.swapRequest.dstChainId;
    const dstProvider = this.providers.get(dstChainId);
    
    if (!dstProvider) {
      throw new Error("Destination chain provider not found");
    }
    
    const dstWallet = this.wallet.connect(dstProvider);
    
    // Get token contract
    const dstToken = new Contract(
      orderData.dstToken || orderData.swapRequest.dstToken,
      ERC20_ABI,
      dstWallet
    );
    
    // Calculate amount to transfer based on accepted price
    const priceFloat = parseFloat(formatUnits(acceptedPrice, 6));
    const srcAmountFloat = parseFloat(formatUnits(orderData.srcAmount || orderData.swapRequest.srcAmount, 6));
    const dstAmountFloat = srcAmountFloat * priceFloat;
    const dstAmount = parseUnits(dstAmountFloat.toFixed(6), 6);
    
    console.log(`[Resolver ${this.config.index}] Transferring ${formatUnits(dstAmount, 6)} tokens to escrow`);
    
    // Transfer tokens directly to escrow (no approval needed)
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
    const priceFloat = parseFloat(formatUnits(acceptedPrice, 6));
    const srcAmountFloat = parseFloat(formatUnits(orderData.srcAmount || orderData.swapRequest.srcAmount, 6));
    const dstAmountFloat = srcAmountFloat * priceFloat;
    const dstAmount = dstAmountFloat.toFixed(6);
    
    try {
      await axios.post(`${this.config.relayerUrl}/api/notify-completion`, {
        orderId,
        resolverAddress: this.wallet.address,
        dstTxHash: orderData.dstTokenTransferTx,
        dstTokenAmount: dstAmount,
        timestamp: Date.now(),
      });
      
      console.log(`[Resolver ${this.config.index}] Completion notification sent`);
    } catch (error) {
      console.error(`[Resolver ${this.config.index}] Error notifying completion:`, error);
      throw error;
    }
  }

  private async monitorAndWithdraw(
    orderId: string,
    orderData: any,
    srcEscrowAddress: string,
    immutables: Immutables
  ): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Monitoring for secret reveal...`);
    
    const maxWaitTime = 300000; // 5 minutes
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check if secret has been revealed
        const response = await axios.get(
          `${this.config.relayerUrl}/api/monitor-secret/${orderId}`
        );
        
        if (response.data.secretRevealed) {
          console.log(`[Resolver ${this.config.index}] Secret revealed! Fetching secret info...`);
          
          // Get the secret info
          const secretResponse = await axios.get(
            `${this.config.relayerUrl}/api/order-secret/${orderId}?resolverAddress=${this.wallet.address}`
          );
          
          if (secretResponse.data.status === "revealed") {
            console.log(`[Resolver ${this.config.index}] Got secret reveal tx: ${secretResponse.data.revealTxHash}`);
            
            // Extract secret from blockchain logs
            const secret = await this.extractSecretFromTx(
              secretResponse.data.dstChainId,
              secretResponse.data.revealTxHash
            );
            
            if (secret) {
              // Withdraw from source escrow
              await this.withdrawFromSourceEscrow(
                orderData.srcChainId || orderData.swapRequest.srcChainId,
                srcEscrowAddress,
                secret,
                immutables
              );
              return;
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error(`[Resolver ${this.config.index}] Error monitoring secret:`, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    console.warn(`[Resolver ${this.config.index}] Timeout waiting for secret reveal`);
  }

  private async extractSecretFromTx(chainId: number, txHash: string): Promise<string | null> {
    console.log(`[Resolver ${this.config.index}] Extracting secret from tx ${txHash}`);
    
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error("Provider not found for chain");
    }
    
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return null;
      }
      
      // Look for Withdrawn event in logs
      // Event signature: Withdrawn(bytes32 secret)
      const withdrawnEventTopic = ethers.id("Withdrawn(bytes32)");
      
      for (const log of receipt.logs) {
        if (log.topics[0] === withdrawnEventTopic && log.topics.length >= 2) {
          // The secret is in topics[1]
          const secret = log.topics[1];
          console.log(`[Resolver ${this.config.index}] Found secret: ${secret}`);
          return secret;
        }
      }
      
      console.warn(`[Resolver ${this.config.index}] No Withdrawn event found in tx`);
      return null;
    } catch (error) {
      console.error(`[Resolver ${this.config.index}] Error extracting secret:`, error);
      return null;
    }
  }

  private async withdrawFromSourceEscrow(
    srcChainId: number,
    srcEscrowAddress: string,
    secret: string,
    immutables: Immutables
  ): Promise<void> {
    console.log(`[Resolver ${this.config.index}] Withdrawing from source escrow...`);
    
    const srcProvider = this.providers.get(srcChainId);
    if (!srcProvider) {
      throw new Error("Source chain provider not found");
    }
    
    const srcWallet = this.wallet.connect(srcProvider);
    
    // Get resolver contract address
    const srcResolverAddress = this.getResolverContractAddress(srcChainId);
    const srcResolver = new Contract(srcResolverAddress, RESOLVER_ABI, srcWallet);
    
    try {
      // Convert Immutables to ImmutablesStruct format for Resolver contract
      const packedTimelocks = this.createTimelocksUint256();
      const withdrawImmutablesUint256: ImmutablesStruct = {
        orderHash: immutables.orderHash,
        hashlock: immutables.hashlock,
        maker: this.addressToUint256(immutables.maker),
        taker: this.addressToUint256(immutables.taker),
        token: this.addressToUint256(immutables.token),
        amount: immutables.amount,
        safetyDeposit: immutables.safetyDeposit,
        timelocks: packedTimelocks
      };
      
      // Call withdraw through resolver contract
      const withdrawTx = await srcResolver.withdraw(
        srcEscrowAddress,
        secret,
        withdrawImmutablesUint256
      );
      console.log(`[Resolver ${this.config.index}] Withdraw tx sent: ${withdrawTx.hash}`);
      
      await withdrawTx.wait();
      console.log(`[Resolver ${this.config.index}] Successfully withdrew from source escrow!`);
      console.log(`[Resolver ${this.config.index}] Funds and safety deposit received`);
    } catch (error) {
      console.error(`[Resolver ${this.config.index}] Error withdrawing from escrow:`, error);
      throw error;
    }
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
    relayerUrl: process.env.RELAYER_URL || "http://localhost:3000",
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
