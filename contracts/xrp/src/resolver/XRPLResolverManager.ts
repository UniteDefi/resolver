import { XRPLResolver } from "./XRPLResolver";
import { XRPLEscrowDetails } from "../htlc/types";
import { EVMOrderDetails, ResolverConfig, CrossChainSwapConfig } from "./types";

export class XRPLResolverManager {
  private resolvers: Map<string, XRPLResolver> = new Map();
  private resolverConfigs: Map<string, ResolverConfig> = new Map();

  constructor(private serverUrl?: string) {}

  // Add resolver to the manager
  addResolver(config: ResolverConfig): void {
    const resolver = new XRPLResolver(config.secret, this.serverUrl);
    this.resolvers.set(config.address, resolver);
    this.resolverConfigs.set(config.address, config);
    
    console.log(`[XRPLResolverManager] Added resolver: ${config.address}`);
  }

  // Get resolver by address
  getResolver(address: string): XRPLResolver | undefined {
    return this.resolvers.get(address);
  }

  // Get all resolver addresses
  getResolverAddresses(): string[] {
    return Array.from(this.resolvers.keys());
  }

  // Connect all resolvers
  async connectAll(): Promise<void> {
    const promises = Array.from(this.resolvers.values()).map(resolver => resolver.connect());
    await Promise.all(promises);
    console.log("[XRPLResolverManager] All resolvers connected");
  }

  // Disconnect all resolvers
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.resolvers.values()).map(resolver => resolver.disconnect());
    await Promise.all(promises);
    console.log("[XRPLResolverManager] All resolvers disconnected");
  }

  // Execute cross-chain swap with multiple resolvers
  async executeCrossChainSwap(config: CrossChainSwapConfig): Promise<{
    success: boolean;
    results: Array<{ resolver: string; result: any }>;
    error?: string;
  }> {
    try {
      console.log("\n[XRPLResolverManager] 🚀 Executing cross-chain swap");
      console.log(`[XRPLResolverManager] Order hash: ${config.evmOrderDetails.orderHash}`);
      console.log(`[XRPLResolverManager] Swap direction: ${config.swapDirection}`);
      console.log(`[XRPLResolverManager] Total XRP amount: ${config.totalXRPAmount} XRP`);
      console.log(`[XRPLResolverManager] Resolvers: ${config.resolverAllocations.length}`);

      const results: Array<{ resolver: string; result: any }> = [];

      // Deploy escrows for each resolver
      for (const allocation of config.resolverAllocations) {
        const resolver = this.getResolver(allocation.resolverAddress);
        if (!resolver) {
          console.error(`[XRPLResolverManager] Resolver not found: ${allocation.resolverAddress}`);
          continue;
        }

        console.log(`\n[XRPLResolverManager] Processing resolver: ${allocation.resolverAddress}`);
        console.log(`[XRPLResolverManager] Allocation: ${allocation.xrpAmount} XRP`);
        console.log(`[XRPLResolverManager] Safety deposit: ${allocation.safetyDeposit} XRP`);

        let result;
        if (config.swapDirection === "EVM_TO_XRPL") {
          // Deploy source escrow on XRPL (resolver provides XRP to user)
          result = await resolver.deploySrcEscrowPartial(
            config.evmOrderDetails,
            allocation.xrpAmount,
            allocation.safetyDeposit,
            config.hashlock
          );
        } else {
          // Deploy destination escrow on XRPL (user provided XRP, resolver facilitates)
          result = await resolver.deployDstEscrowPartial(
            config.evmOrderDetails,
            allocation.xrpAmount,
            allocation.safetyDeposit,
            config.hashlock
          );
        }

        results.push({
          resolver: allocation.resolverAddress,
          result: result
        });

        if (!result.success) {
          console.error(`[XRPLResolverManager] ❌ Failed for resolver ${allocation.resolverAddress}: ${result.error}`);
        } else {
          console.log(`[XRPLResolverManager] ✅ Success for resolver ${allocation.resolverAddress}: ${result.txHash}`);
        }
      }

      const successCount = results.filter(r => r.result.success).length;
      const totalCount = results.length;

      console.log(`\n[XRPLResolverManager] 📊 Summary: ${successCount}/${totalCount} resolvers successful`);

      return {
        success: successCount > 0,
        results: results
      };

    } catch (error) {
      console.error("[XRPLResolverManager] Error executing cross-chain swap:", error);
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  // Fulfill all escrows with secret (after secret is revealed)
  async fulfillAllEscrows(orderHash: string, secret: string): Promise<{
    success: boolean;
    results: Array<{ resolver: string; result: any }>;
  }> {
    console.log(`\n[XRPLResolverManager] 🔓 Fulfilling all escrows with secret`);
    console.log(`[XRPLResolverManager] Order hash: ${orderHash}`);

    const results: Array<{ resolver: string; result: any }> = [];

    for (const [address, resolver] of this.resolvers) {
      const escrows = resolver.getEscrows(orderHash);
      
      for (const escrow of escrows) {
        console.log(`[XRPLResolverManager] Fulfilling escrow for resolver ${address}: ${escrow.txHash}`);
        
        const result = await resolver.fulfillEscrow(escrow, secret);
        results.push({
          resolver: address,
          result: result
        });

        if (result.success) {
          console.log(`[XRPLResolverManager] ✅ Fulfilled escrow: ${result.txHash}`);
        } else {
          console.error(`[XRPLResolverManager] ❌ Failed to fulfill escrow: ${result.error}`);
        }
      }
    }

    const successCount = results.filter(r => r.result.success).length;
    console.log(`[XRPLResolverManager] 📊 Fulfilled ${successCount}/${results.length} escrows`);

    return {
      success: successCount > 0,
      results: results
    };
  }

  // Get balances for all resolvers
  async getAllBalances(): Promise<{ [address: string]: string }> {
    const balances: { [address: string]: string } = {};
    
    for (const [address, resolver] of this.resolvers) {
      try {
        balances[address] = await resolver.getBalance();
      } catch (error) {
        balances[address] = "Error";
      }
    }
    
    return balances;
  }
}
