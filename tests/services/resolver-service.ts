import { EventEmitter } from "events";
import { 
  JsonRpcProvider, 
  Contract, 
  Wallet,
  parseUnits,
  formatUnits,
  randomBytes,
  keccak256,
  toUtf8Bytes
} from "ethers";
import { 
  Account,
  AccountAddress,
  Aptos,
  AptosConfig,
  Network
} from "@aptos-labs/ts-sdk";
import { AptosClientHelper } from "../aptos/helpers/aptos-client";
import { RelayerService, SwapOrder, OrderState } from "./relayer-service";

export interface ResolverConfig {
  name: string;
  address: string;
  privateKey: string;
  minimumProfitBps: number; // Basis points (100 = 1%)
  safetyDepositAmount: bigint;
  baseSepolia: {
    rpc: string;
    relayerEscrow: string;
  };
  aptos: {
    network: Network;
    relayerEscrow: string;
  };
}

export class ResolverService extends EventEmitter {
  private baseProvider: JsonRpcProvider;
  private baseWallet: Wallet;
  private baseContract: Contract;
  private aptosClient: AptosClientHelper;
  private aptosAccount: Account;
  private isRunning: boolean = false;
  private activeOrders: Map<string, SwapOrder> = new Map();
  private secrets: Map<string, string> = new Map();

  constructor(
    private config: ResolverConfig,
    private relayer: RelayerService
  ) {
    super();
    
    // Initialize Base Sepolia connection
    this.baseProvider = new JsonRpcProvider(config.baseSepolia.rpc);
    this.baseWallet = new Wallet(config.privateKey, this.baseProvider);
    
    // Initialize Aptos connection
    this.aptosClient = new AptosClientHelper(config.aptos.network);
    this.aptosAccount = Account.fromPrivateKey({
      privateKey: config.privateKey
    });
  }

  async start(): Promise<void> {
    console.log(`[Resolver ${this.config.name}] Starting resolver service...`);
    
    // Initialize contracts
    const relayerEscrowAbi = [
      "function depositSafetyFunds() payable",
      "function commitToOrder(bytes32 orderId)",
      "function notifyEscrowsDeployed(bytes32 orderId, bytes32 secretHash, address srcEscrow, address dstEscrow)",
      "function rescueOrder(bytes32 orderId, bytes32 secret)",
      "function getResolverDeposit(address resolver) view returns (uint256 amount, bool isLocked, uint256 depositTime)",
      "function isOrderExpired(bytes32 orderId) view returns (bool)"
    ];
    
    this.baseContract = new Contract(this.config.baseSepolia.relayerEscrow, relayerEscrowAbi, this.baseWallet);
    
    // Deposit safety funds
    await this.depositSafetyFunds();
    
    // Register with relayer
    this.relayer.registerResolver(this.config.address);
    
    // Listen for order broadcasts
    this.relayer.on("orderBroadcast", this.handleOrderBroadcast.bind(this));
    this.relayer.on("orderTimedOut", this.handleOrderTimeout.bind(this));
    
    this.isRunning = true;
    console.log(`[Resolver ${this.config.name}] Service started successfully`);
  }

  private async depositSafetyFunds(): Promise<void> {
    try {
      // Deposit on Base Sepolia
      const tx = await this.baseContract.depositSafetyFunds({ 
        value: this.config.safetyDepositAmount 
      });
      await tx.wait();
      
      // Deposit on Aptos
      await this.aptosClient.submitTransaction(
        this.aptosAccount,
        {
          function: `${this.config.aptos.relayerEscrow}::relayer_escrow::deposit_safety_funds`,
          functionArguments: [this.config.safetyDepositAmount.toString()],
          typeArguments: []
        }
      );
      
      console.log(`[Resolver ${this.config.name}] Safety funds deposited`);
      
    } catch (error) {
      console.error(`[Resolver ${this.config.name}] Failed to deposit safety funds:`, error);
      throw error;
    }
  }

  private async handleOrderBroadcast(data: { order: SwapOrder; marketPrice: number; resolvers: string[] }): Promise<void> {
    const { order, marketPrice } = data;
    
    // Check if this order is profitable
    if (!this.isOrderProfitable(order, marketPrice)) {
      console.log(`[Resolver ${this.config.name}] Order ${order.orderId} not profitable, skipping`);
      return;
    }

    // Small random delay to simulate network latency and prevent all resolvers from committing simultaneously
    await this.delay(Math.random() * 1000);

    try {
      await this.commitToOrder(order);
    } catch (error) {
      console.log(`[Resolver ${this.config.name}] Failed to commit to order ${order.orderId}:`, error);
    }
  }

  private isOrderProfitable(order: SwapOrder, marketPrice: number): boolean {
    const srcAmount = Number(formatUnits(order.srcAmount, 6));
    const dstAmount = Number(formatUnits(order.dstAmount, 6));
    const profit = srcAmount - dstAmount;
    const profitBps = (profit / srcAmount) * 10000;
    
    return profitBps >= this.config.minimumProfitBps;
  }

  private async commitToOrder(order: SwapOrder): Promise<void> {
    console.log(`[Resolver ${this.config.name}] Committing to order ${order.orderId}`);
    
    try {
      if (order.srcChain === "Base Sepolia") {
        const tx = await this.baseContract.commitToOrder(order.orderId);
        await tx.wait();
      } else {
        // Commit on Aptos
        await this.aptosClient.submitTransaction(
          this.aptosAccount,
          {
            function: `${this.config.aptos.relayerEscrow}::relayer_escrow::commit_to_order`,
            functionArguments: [order.orderId],
            typeArguments: []
          }
        );
      }
      
      console.log(`[Resolver ${this.config.name}] Committed to order ${order.orderId}`);
      this.activeOrders.set(order.orderId, order);
      
      // Deploy escrows
      await this.deployEscrows(order);
      
    } catch (error) {
      console.error(`[Resolver ${this.config.name}] Failed to commit to order:`, error);
      throw error;
    }
  }

  private async deployEscrows(order: SwapOrder): Promise<void> {
    console.log(`[Resolver ${this.config.name}] Deploying escrows for order ${order.orderId}`);
    
    // Generate secret and hash
    const secret = randomBytes(32);
    const secretHash = keccak256(secret);
    
    // Store secret for later use
    this.secrets.set(order.orderId, "0x" + secret.toString("hex"));
    
    // Mock escrow addresses (in real implementation, these would be actual deployed contracts)
    const srcEscrow = `0x${randomBytes(20).toString("hex")}`;
    const dstEscrow = `0x${randomBytes(20).toString("hex")}`;
    
    try {
      if (order.srcChain === "Base Sepolia") {
        const tx = await this.baseContract.notifyEscrowsDeployed(
          order.orderId,
          secretHash,
          srcEscrow,
          dstEscrow
        );
        await tx.wait();
      } else {
        // Notify on Aptos
        await this.aptosClient.submitTransaction(
          this.aptosAccount,
          {
            function: `${this.config.aptos.relayerEscrow}::relayer_escrow::notify_escrows_deployed`,
            functionArguments: [order.orderId, secretHash, srcEscrow, dstEscrow],
            typeArguments: []
          }
        );
      }
      
      console.log(`[Resolver ${this.config.name}] Escrows deployed for order ${order.orderId}`);
      console.log(`  Secret hash: ${secretHash}`);
      console.log(`  Source escrow: ${srcEscrow}`);
      console.log(`  Destination escrow: ${dstEscrow}`);
      
      // Simulate resolver depositing funds to destination escrow
      console.log(`[Resolver ${this.config.name}] Depositing ${formatUnits(order.dstAmount, 6)} tokens to destination escrow`);
      
      // Wait a bit then complete the order
      setTimeout(() => {
        this.completeOrder(order.orderId);
      }, 2000);
      
    } catch (error) {
      console.error(`[Resolver ${this.config.name}] Failed to deploy escrows:`, error);
      throw error;
    }
  }

  private async completeOrder(orderId: string): Promise<void> {
    const order = this.activeOrders.get(orderId);
    const secret = this.secrets.get(orderId);
    
    if (!order || !secret) {
      console.error(`[Resolver ${this.config.name}] Order or secret not found for ${orderId}`);
      return;
    }

    try {
      console.log(`[Resolver ${this.config.name}] Completing order ${orderId}`);
      
      // Notify relayer to complete the order
      await this.relayer.completeOrder(orderId, secret);
      
      console.log(`[Resolver ${this.config.name}] Order ${orderId} completed successfully`);
      console.log(`[Resolver ${this.config.name}] Revealed secret: ${secret}`);
      
      // Calculate profit
      const profit = Number(formatUnits(order.srcAmount - order.dstAmount, 6));
      console.log(`[Resolver ${this.config.name}] Profit earned: ${profit.toFixed(6)} USDC`);
      
      this.activeOrders.delete(orderId);
      this.secrets.delete(orderId);
      
      this.emit("orderCompleted", { order, secret, profit });
      
    } catch (error) {
      console.error(`[Resolver ${this.config.name}] Failed to complete order:`, error);
    }
  }

  private async handleOrderTimeout(order: SwapOrder): Promise<void> {
    // Check if we can rescue this order
    if (this.activeOrders.has(order.orderId)) {
      console.log(`[Resolver ${this.config.name}] Own order ${order.orderId} timed out`);
      return;
    }

    // Small random delay to prevent all resolvers from racing
    await this.delay(Math.random() * 2000);

    try {
      await this.rescueOrder(order);
    } catch (error) {
      console.log(`[Resolver ${this.config.name}] Failed to rescue order ${order.orderId}:`, error);
    }
  }

  private async rescueOrder(order: SwapOrder): Promise<void> {
    console.log(`[Resolver ${this.config.name}] Attempting to rescue order ${order.orderId}`);
    
    // In a real implementation, we would need to have access to the secret
    // For this simulation, we'll generate a mock secret
    const secret = randomBytes(32);
    const secretHex = "0x" + secret.toString("hex");
    
    try {
      if (order.srcChain === "Base Sepolia") {
        // Check if order is actually expired
        const isExpired = await this.baseContract.isOrderExpired(order.orderId);
        if (!isExpired) {
          console.log(`[Resolver ${this.config.name}] Order ${order.orderId} not yet expired`);
          return;
        }
        
        const tx = await this.baseContract.rescueOrder(order.orderId, secretHex);
        await tx.wait();
      } else {
        // Rescue on Aptos
        await this.aptosClient.submitTransaction(
          this.aptosAccount,
          {
            function: `${this.config.aptos.relayerEscrow}::relayer_escrow::rescue_order`,
            functionArguments: [order.orderId, secretHex],
            typeArguments: []
          }
        );
      }
      
      console.log(`[Resolver ${this.config.name}] Successfully rescued order ${order.orderId}`);
      console.log(`[Resolver ${this.config.name}] Claimed penalty from original resolver`);
      
      // Calculate rescue profit (includes penalty)
      const orderProfit = Number(formatUnits(order.srcAmount - order.dstAmount, 6));
      const penalty = Number(formatUnits(this.config.safetyDepositAmount, 18));
      const totalProfit = orderProfit + penalty;
      
      console.log(`[Resolver ${this.config.name}] Total rescue profit: ${totalProfit.toFixed(6)} (${orderProfit.toFixed(6)} order + ${penalty.toFixed(6)} penalty)`);
      
      this.emit("orderRescued", { order, secret: secretHex, profit: totalProfit });
      
    } catch (error) {
      console.error(`[Resolver ${this.config.name}] Failed to rescue order:`, error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get resolver statistics
  getStats() {
    return {
      name: this.config.name,
      address: this.config.address,
      activeOrders: this.activeOrders.size,
      minimumProfitBps: this.config.minimumProfitBps,
      safetyDepositAmount: formatUnits(this.config.safetyDepositAmount, 18) + " ETH"
    };
  }

  async stop(): Promise<void> {
    console.log(`[Resolver ${this.config.name}] Stopping service...`);
    this.isRunning = false;
    this.removeAllListeners();
    this.activeOrders.clear();
    this.secrets.clear();
  }
}