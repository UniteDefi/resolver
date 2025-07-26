import { BaseResolver } from "./base_resolver";
import { ResolverConfig } from "../common/config";

export class BalancedResolver extends BaseResolver {
  constructor(config: ResolverConfig) {
    super({
      ...config,
      competitionDelayMs: 500 // Balanced approach
    });
    this.logger.log("Balanced resolver initialized - moderate delay strategy");
  }
}