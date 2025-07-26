import { BaseResolver } from "./base_resolver";
import { ResolverConfig } from "../common/config";

export class FastResolver extends BaseResolver {
  constructor(config: ResolverConfig) {
    super({
      ...config,
      competitionDelayMs: 100 // Very fast, tries to be first
    });
    this.logger.log("Fast resolver initialized - minimal delay strategy");
  }
}