import dotenv from 'dotenv';
dotenv.config();

import { CrossChainResolver } from './cross_chain_resolver';
import { CROSS_CHAIN_CONFIG, validateConfig } from './common/cross_chain_config';
import { Logger } from './common/logger';

const logger = new Logger('CrossChainResolverService');

async function main(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();
    
    logger.log('Starting Cross-Chain Resolver Service...');
    logger.log(`Resolver ID: ${CROSS_CHAIN_CONFIG.id}`);
    logger.log(`Relayer API: ${CROSS_CHAIN_CONFIG.relayerApiUrl}`);
    logger.log(`Max Acceptable Price: ${CROSS_CHAIN_CONFIG.maxAcceptablePrice}`);
    logger.log(`Min Safety Deposit: ${CROSS_CHAIN_CONFIG.minSafetyDeposit}`);
    
    // Create and start resolver
    const resolver = new CrossChainResolver(CROSS_CHAIN_CONFIG);
    await resolver.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.log('\\nReceived SIGINT, shutting down gracefully...');
      await resolver.stop();
      logger.success('Resolver service stopped.');
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.log('\\nReceived SIGTERM, shutting down gracefully...');
      await resolver.stop();
      logger.success('Resolver service stopped.');
      process.exit(0);
    });
    
    // Keep the process running
    logger.success('Cross-Chain Resolver Service is running. Press Ctrl+C to stop.');
    
  } catch (error) {
    logger.error('Failed to start Cross-Chain Resolver Service:', error);
    process.exit(1);
  }
}

// Run the service
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error in Cross-Chain Resolver Service:', error);
    process.exit(1);
  });
}

export { main };