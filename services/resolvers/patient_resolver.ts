import { ethers } from "ethers";
import { BaseResolver } from "./base_resolver";
import { ResolverConfig, AuctionInfo } from "../common/config";

export class PatientResolver extends BaseResolver {
  constructor(config: ResolverConfig) {
    super({
      ...config,
      competitionDelayMs: 2000 // Waits longer for better prices
    });
    this.logger.log("Patient resolver initialized - waits for better prices");
  }

  protected async evaluateAuction(auction: AuctionInfo) {
    try {
      const contract = this.contracts.get(auction.chain);
      if (!contract) return;

      // Calculate how much time has passed
      const provider = this.providers.get(auction.chain);
      if (!provider) return;
      
      const currentBlock = await provider.getBlock("latest");
      if (!currentBlock) return;
      
      const elapsed = currentBlock.timestamp - auction.startTime;
      const progress = elapsed / auction.duration;

      // Only bid when price has dropped at least 50%
      if (progress < 0.5) {
        this.logger.log(`Waiting for better price on auction ${auction.auctionId} (${(progress * 100).toFixed(1)}% complete)`);
        return;
      }

      // Call parent's evaluate method
      await super["evaluateAuction"](auction);
    } catch (error) {
      this.logger.error(`Failed to evaluate auction:`, error);
    }
  }
}