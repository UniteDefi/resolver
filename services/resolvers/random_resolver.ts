import { BaseResolver } from "./base_resolver";
import { ResolverConfig, AuctionInfo } from "../common/config";

export class RandomResolver extends BaseResolver {
  constructor(config: ResolverConfig) {
    super({
      ...config,
      competitionDelayMs: 1000
    });
    this.logger.log("Random resolver initialized - unpredictable strategy");
  }

  protected async evaluateAuction(auction: AuctionInfo) {
    // Random 50% chance to skip this evaluation
    if (Math.random() < 0.5) {
      this.logger.log(`Randomly skipping auction ${auction.auctionId}`);
      return;
    }

    // Random additional delay 0-2000ms
    const extraDelay = Math.random() * 2000;
    this.logger.log(`Adding random delay of ${extraDelay.toFixed(0)}ms`);
    
    await new Promise(resolve => setTimeout(resolve, extraDelay));
    await super["evaluateAuction"](auction);
  }
}