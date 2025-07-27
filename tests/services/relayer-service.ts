import { EventEmitter } from "events";
import { 
  JsonRpcProvider, 
  Contract, 
  Wallet,
  parseUnits,
  formatUnits,
  randomBytes
} from "ethers";
import { 
  Account,
  AccountAddress,
  Aptos,
  AptosConfig,
  Network,
  U64
} from "@aptos-labs/ts-sdk";
import { AptosClientHelper } from "../aptos/helpers/aptos-client";

export interface SwapOrder {
  orderId: string;
  user: string;
  srcChain: string;
  dstChain: string;
  srcToken: string;
  dstToken: string;
  srcAmount: bigint;
  dstAmount: bigint;
  state: OrderState;
  committedResolver?: string;
  commitmentTime?: number;
  secretHash?: string;
  secret?: string;
  createdAt: number;
}

export enum OrderState {
  Pending = 0,
  Committed = 1,
  EscrowsDeployed = 2,
  FundsLocked = 3,
  Completed = 4,
  Rescued = 5,
  Cancelled = 6
}

export interface RelayerConfig {
  baseSepolia: {
    rpc: string;
    chainId: number;
    relayerEscrow: string;
    privateKey: string;
  };
  aptos: {
    network: Network;
    relayerEscrow: string;
    privateKey: string;
  };
}

export class RelayerService extends EventEmitter {
  private baseProvider: JsonRpcProvider;
  private baseWallet: Wallet;
  private baseContract: Contract;
  private aptosClient: AptosClientHelper;
  private aptosAccount: Account;
  private orders: Map<string, SwapOrder>;
  private resolvers: Set<string>;
  private isRunning: boolean = false;

  constructor(private config: RelayerConfig) {
    super();
    
    // Initialize Base Sepolia connection
    this.baseProvider = new JsonRpcProvider(config.baseSepolia.rpc);
    this.baseWallet = new Wallet(config.baseSepolia.privateKey, this.baseProvider);
    
    // Initialize Aptos connection
    this.aptosClient = new AptosClientHelper(config.aptos.network);
    this.aptosAccount = Account.fromPrivateKey({
      privateKey: config.aptos.privateKey
    });
    
    this.orders = new Map();
    this.resolvers = new Set();
  }

  async start(): Promise<void> {
    console.log("[Relayer] Starting relayer service...");
    
    // Initialize contracts
    const relayerEscrowAbi = [
      "function createOrder(address user, address srcToken, address dstToken, uint256 srcAmount, uint256 dstAmount, uint256 srcChainId, uint256 dstChainId) returns (bytes32)",
      "function lockUserFunds(bytes32 orderId, address token)",
      "function completeOrder(bytes32 orderId, bytes32 secret)",
      "function getOrder(bytes32 orderId) view returns (uint8 state, address user, address committedResolver, uint256 srcAmount, uint256 dstAmount, uint256 commitmentTime)",
      "event OrderCreated(bytes32 indexed orderId, address indexed user, uint256 srcAmount, uint256 dstAmount, uint256 srcChainId, uint256 dstChainId)",
      "event OrderCommitted(bytes32 indexed orderId, address indexed resolver, uint256 commitmentTime)",
      "event EscrowsDeployed(bytes32 indexed orderId, address indexed resolver, address srcEscrow, address dstEscrow)",
      "event FundsLocked(bytes32 indexed orderId, bool userFundsLocked, bool resolverFundsLocked)",
      "event OrderCompleted(bytes32 indexed orderId, address indexed user, address indexed resolver, bytes32 secret)",
      "event OrderRescued(bytes32 indexed orderId, address indexed originalResolver, address indexed rescueResolver, uint256 penaltyClaimed)"
    ];
    
    this.baseContract = new Contract(config.baseSepolia.relayerEscrow, relayerEscrowAbi, this.baseWallet);
    
    // Set up event listeners
    this.setupEventListeners();
    
    this.isRunning = true;
    console.log("[Relayer] Service started successfully");
  }

  private setupEventListeners(): void {
    // Listen for Base Sepolia events
    this.baseContract.on("OrderCommitted", (orderId: string, resolver: string, commitmentTime: bigint) => {
      console.log(`[Relayer] Order committed: ${orderId} by ${resolver}`);
      this.handleOrderCommitted(orderId, resolver, Number(commitmentTime));
    });

    this.baseContract.on("EscrowsDeployed", (orderId: string, resolver: string, srcEscrow: string, dstEscrow: string) => {
      console.log(`[Relayer] Escrows deployed for order: ${orderId}`);
      this.handleEscrowsDeployed(orderId, resolver, srcEscrow, dstEscrow);
    });
  }

  // User creates a swap order
  async createSwapOrder(
    user: string,
    srcChain: string,
    dstChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint
  ): Promise<string> {
    console.log(`[Relayer] Creating swap order: ${formatUnits(srcAmount, 6)} ${srcChain} -> ${formatUnits(dstAmount, 6)} ${dstChain}`);
    
    let orderId: string;
    
    if (srcChain === "Base Sepolia") {
      // Create order on Base Sepolia contract
      const tx = await this.baseContract.createOrder(
        user,
        srcToken,
        dstToken,
        srcAmount,
        dstAmount,
        8453, // Base Sepolia chain ID
        999 // Aptos chain ID (mock)
      );
      const receipt = await tx.wait();
      
      // Extract order ID from event
      const event = receipt.logs.find((log: any) => log.fragment?.name === "OrderCreated");
      orderId = event.args[0];
      
    } else {
      // Create order on Aptos
      const tx = await this.aptosClient.submitTransaction(
        this.aptosAccount,
        {
          function: `${this.config.aptos.relayerEscrow}::relayer_escrow::create_order`,
          functionArguments: [
            user,
            srcToken,
            dstToken,
            srcAmount.toString(),
            dstAmount.toString(),
            999, // Aptos chain ID
            8453 // Base Sepolia chain ID
          ],
          typeArguments: ["0x1::aptos_coin::AptosCoin"]
        }
      );
      orderId = tx.hash; // Use transaction hash as order ID for simulation
    }

    // Store order
    const order: SwapOrder = {
      orderId,
      user,
      srcChain,
      dstChain,
      srcToken,
      dstToken,
      srcAmount,
      dstAmount,
      state: OrderState.Pending,
      createdAt: Date.now()
    };
    
    this.orders.set(orderId, order);
    
    // Broadcast to resolvers
    await this.broadcastOrderToResolvers(order);
    
    this.emit("orderCreated", order);
    return orderId;
  }

  // Broadcast order to all registered resolvers
  private async broadcastOrderToResolvers(order: SwapOrder): Promise<void> {
    console.log(`[Relayer] Broadcasting order ${order.orderId} to ${this.resolvers.size} resolvers`);
    
    // Calculate current market price (simplified)
    const marketPrice = Number(formatUnits(order.dstAmount, 6)) / Number(formatUnits(order.srcAmount, 6));
    
    this.emit("orderBroadcast", {
      order,
      marketPrice,
      resolvers: Array.from(this.resolvers)
    });
  }

  // Register a resolver
  registerResolver(resolverAddress: string): void {
    this.resolvers.add(resolverAddress);
    console.log(`[Relayer] Registered resolver: ${resolverAddress}`);
  }

  // Handle order commitment from resolver
  private async handleOrderCommitted(orderId: string, resolver: string, commitmentTime: number): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) return;

    order.state = OrderState.Committed;
    order.committedResolver = resolver;
    order.commitmentTime = commitmentTime;

    console.log(`[Relayer] Order ${orderId} committed by ${resolver}`);
    this.emit("orderCommitted", { order, resolver });

    // Start 5-minute timer
    setTimeout(() => {
      this.checkOrderTimeout(orderId);
    }, 5 * 60 * 1000);
  }

  // Handle escrows deployed notification
  private async handleEscrowsDeployed(orderId: string, resolver: string, srcEscrow: string, dstEscrow: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) return;

    order.state = OrderState.EscrowsDeployed;
    
    console.log(`[Relayer] Escrows deployed for order ${orderId}`);
    console.log(`  Source escrow: ${srcEscrow}`);
    console.log(`  Destination escrow: ${dstEscrow}`);

    // Lock user funds
    await this.lockUserFunds(orderId);
  }

  // Lock user funds in escrow
  private async lockUserFunds(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) return;

    try {
      if (order.srcChain === "Base Sepolia") {
        const tx = await this.baseContract.lockUserFunds(orderId, order.srcToken);
        await tx.wait();
      } else {
        // Lock funds on Aptos
        await this.aptosClient.submitTransaction(
          this.aptosAccount,
          {
            function: `${this.config.aptos.relayerEscrow}::relayer_escrow::lock_user_funds`,
            functionArguments: [orderId],
            typeArguments: ["0x1::aptos_coin::AptosCoin"]
          }
        );
      }

      order.state = OrderState.FundsLocked;
      console.log(`[Relayer] User funds locked for order ${orderId}`);
      this.emit("fundsLocked", order);

    } catch (error) {
      console.error(`[Relayer] Failed to lock user funds for order ${orderId}:`, error);
    }
  }

  // Complete order by revealing secret
  async completeOrder(orderId: string, secret: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error("Order not found");

    try {
      if (order.srcChain === "Base Sepolia") {
        const tx = await this.baseContract.completeOrder(orderId, secret);
        await tx.wait();
      } else {
        // Complete on Aptos
        await this.aptosClient.submitTransaction(
          this.aptosAccount,
          {
            function: `${this.config.aptos.relayerEscrow}::relayer_escrow::complete_order`,
            functionArguments: [orderId, secret],
            typeArguments: []
          }
        );
      }

      order.state = OrderState.Completed;
      order.secret = secret;
      
      console.log(`[Relayer] Order ${orderId} completed successfully`);
      this.emit("orderCompleted", { order, secret });

    } catch (error) {
      console.error(`[Relayer] Failed to complete order ${orderId}:`, error);
      throw error;
    }
  }

  // Check for order timeout
  private async checkOrderTimeout(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order || order.state !== OrderState.FundsLocked) return;

    console.log(`[Relayer] Order ${orderId} timed out - available for rescue`);
    this.emit("orderTimedOut", order);
  }

  // Get order details
  getOrder(orderId: string): SwapOrder | undefined {
    return this.orders.get(orderId);
  }

  // Get all orders
  getAllOrders(): SwapOrder[] {
    return Array.from(this.orders.values());
  }

  // Get orders by state
  getOrdersByState(state: OrderState): SwapOrder[] {
    return Array.from(this.orders.values()).filter(order => order.state === state);
  }

  // Generate statistics
  getStats() {
    const orders = Array.from(this.orders.values());
    return {
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => o.state === OrderState.Pending).length,
      committedOrders: orders.filter(o => o.state === OrderState.Committed).length,
      completedOrders: orders.filter(o => o.state === OrderState.Completed).length,
      rescuedOrders: orders.filter(o => o.state === OrderState.Rescued).length,
      registeredResolvers: this.resolvers.size
    };
  }

  async stop(): Promise<void> {
    console.log("[Relayer] Stopping service...");
    this.isRunning = false;
    this.removeAllListeners();
    this.orders.clear();
    this.resolvers.clear();
  }
}