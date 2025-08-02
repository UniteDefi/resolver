import { XRPLResolverManager } from "./XRPLResolverManager";
import { EVMOrderDetails, CrossChainSwapConfig, ResolverAllocation } from "./types";

export class CrossChainCoordinator {
  private resolverManager: XRPLResolverManager;

  constructor(serverUrl?: string) {
    this.resolverManager = new XRPLResolverManager(serverUrl);
  }

  getResolverManager(): XRPLResolverManager {
    return this.resolverManager;
  }

  // Create swap config with automatic resolver allocation
  createSwapConfig(
    evmOrderDetails: EVMOrderDetails,
    hashlock: string,
    swapDirection: "EVM_TO_XRPL" | "XRPL_TO_EVM",
    totalXRPAmount: string,
    resolverAddresses: string[],
    safetyDepositPercentage: number = 1 // 1% safety deposit
  ): CrossChainSwapConfig {
    // Distribute XRP amount across resolvers
    const resolverCount = resolverAddresses.length;
    const baseAmount = parseFloat(totalXRPAmount) / resolverCount;
    
    const allocations: ResolverAllocation[] = resolverAddresses.map((address, index) => {
      // Give slightly different amounts for more realistic partial fills
      const variation = 0.1 * (Math.random() - 0.5); // ±5% variation
      const amount = baseAmount * (1 + variation);
      const safetyDeposit = amount * (safetyDepositPercentage / 100);
      
      return {
        resolverAddress: address,
        xrpAmount: amount.toFixed(6),
        safetyDeposit: safetyDeposit.toFixed(6)
      };
    });

    // Adjust last allocation to match exact total
    const allocatedTotal = allocations.reduce((sum, alloc) => sum + parseFloat(alloc.xrpAmount), 0);
    const difference = parseFloat(totalXRPAmount) - allocatedTotal;
    if (Math.abs(difference) > 0.000001) {
      allocations[allocations.length - 1].xrpAmount = 
        (parseFloat(allocations[allocations.length - 1].xrpAmount) + difference).toFixed(6);
    }

    return {
      evmOrderDetails,
      hashlock,
      swapDirection,
      totalXRPAmount,
      resolverAllocations: allocations
    };
  }

  // Execute complete cross-chain swap flow
  async executeSwap(config: CrossChainSwapConfig): Promise<{
    success: boolean;
    escrowResults: any[];
    fulfillResults?: any[];
    error?: string;
  }> {
    try {
      console.log("\n[CrossChainCoordinator] 🌉 Starting cross-chain swap coordination");
      
      // Connect all resolvers
      await this.resolverManager.connectAll();

      // Deploy escrows
      const escrowResults = await this.resolverManager.executeCrossChainSwap(config);
      
      if (!escrowResults.success) {
        return {
          success: false,
          escrowResults: escrowResults.results,
          error: "Failed to deploy escrows"
        };
      }

      console.log("\n[CrossChainCoordinator] ✅ Escrows deployed successfully");
      console.log("[CrossChainCoordinator] 🔐 Ready for secret revelation and fulfillment");

      return {
        success: true,
        escrowResults: escrowResults.results
      };

    } catch (error) {
      console.error("[CrossChainCoordinator] Error executing swap:", error);
      return {
        success: false,
        escrowResults: [],
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  // Fulfill all escrows after secret is revealed
  async fulfillSwap(orderHash: string, secret: string): Promise<{
    success: boolean;
    results: any[];
  }> {
    console.log("\n[CrossChainCoordinator] 🔓 Fulfilling swap with revealed secret");
    
    const results = await this.resolverManager.fulfillAllEscrows(orderHash, secret);
    
    if (results.success) {
      console.log("[CrossChainCoordinator] ✅ Swap fulfilled successfully");
    } else {
      console.log("[CrossChainCoordinator] ❌ Swap fulfillment failed");
    }

    return results;
  }

  // Cleanup - disconnect all resolvers
  async cleanup(): Promise<void> {
    await this.resolverManager.disconnectAll();
  }
}
