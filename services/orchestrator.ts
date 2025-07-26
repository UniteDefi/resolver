import dotenv from 'dotenv'
dotenv.config()
import {ethers} from 'ethers'
import {SellerService, TestScenario} from './seller/seller_service'
import {FastResolver} from './resolvers/fast_resolver'
import {PatientResolver} from './resolvers/patient_resolver'
import {BalancedResolver} from './resolvers/balanced_resolver'
import {RandomResolver} from './resolvers/random_resolver'
import {Logger} from './common/logger'

const logger = new Logger('Orchestrator')

// Test scenarios
const TEST_SCENARIOS: TestScenario[] = [
    {
        name: 'Quick Drop',
        startPrice: '0.002',
        endPrice: '0.0005',
        duration: 60, // 1 minute
        amount: '0.001'
    },
    {
        name: 'Medium Auction',
        startPrice: '0.003',
        endPrice: '0.001',
        duration: 180, // 3 minutes
        amount: '0.001'
    },
    {
        name: 'Slow Decline',
        startPrice: '0.005',
        endPrice: '0.0005',
        duration: 300, // 5 minutes
        amount: '0.001'
    },
    {
        name: 'Micro Auction',
        startPrice: '0.001',
        endPrice: '0.0002',
        duration: 120, // 2 minutes
        amount: '0.0005'
    }
]

// Get test wallets from environment only
const getTestWallet = (envKey: string): ethers.Wallet => {
    const privateKey = process.env[envKey];
    
    if (!privateKey || privateKey.trim() === '') {
        logger.error(`${envKey} not set in .env`)
        logger.error(`Run 'npx tsx scripts/generate_random_wallets.ts' to generate new wallets`)
        process.exit(1)
    }
    
    logger.log(`Using wallet from ${envKey}`)
    return new ethers.Wallet(privateKey)
}

async function main() {
    logger.log('Starting multi-resolver competition test...')

    // Get chains to test
    const chains = process.env.TEST_CHAINS?.split(',') || ['ethereum_sepolia']
    logger.log(`Testing on chains: ${chains.join(', ')}`)

    // Create seller
    const sellerWallet = getTestWallet('SELLER_WALLET_PRIVATE_KEY')
    const seller = new SellerService({
        privateKey: sellerWallet.privateKey,
        chains,
        auctionInterval: 30000, // New auction every 30 seconds
        testScenarios: TEST_SCENARIOS
    })

    // Create resolvers with different strategies
    const resolvers = [
        new FastResolver({
            id: 'FAST-1',
            privateKey: getTestWallet('RESOLVER1_WALLET_PRIVATE_KEY').privateKey,
            maxPriceWei: '0.005',
            minBalanceWei: '0.01',
            competitionDelayMs: 100,
            chains
        }),
        new PatientResolver({
            id: 'PATIENT-1',
            privateKey: getTestWallet('RESOLVER2_WALLET_PRIVATE_KEY').privateKey,
            maxPriceWei: '0.003',
            minBalanceWei: '0.01',
            competitionDelayMs: 2000,
            chains
        }),
        new BalancedResolver({
            id: 'BALANCED-1',
            privateKey: getTestWallet('RESOLVER3_WALLET_PRIVATE_KEY').privateKey,
            maxPriceWei: '0.004',
            minBalanceWei: '0.01',
            competitionDelayMs: 500,
            chains
        }),
        new RandomResolver({
            id: 'RANDOM-1',
            privateKey: getTestWallet('RESOLVER4_WALLET_PRIVATE_KEY').privateKey,
            maxPriceWei: '0.004',
            minBalanceWei: '0.01',
            competitionDelayMs: 1000,
            chains
        })
    ]

    // Log wallet addresses
    logger.log('Wallet addresses:')
    logger.log(`Seller: ${sellerWallet.address}`)
    resolvers.forEach((resolver, i) => {
        const walletKeys = ['RESOLVER1_WALLET_PRIVATE_KEY', 'RESOLVER2_WALLET_PRIVATE_KEY', 'RESOLVER3_WALLET_PRIVATE_KEY', 'RESOLVER4_WALLET_PRIVATE_KEY']
        logger.log(`Resolver ${i + 1}: ${getTestWallet(walletKeys[i]).address}`)
    })

    // Start all services
    try {
        await seller.start()
        for (const resolver of resolvers) {
            await resolver.start()
        }

        logger.success('All services started!')
        logger.log('Competition is now active. Press Ctrl+C to stop.')

        // Keep the process running
        process.on('SIGINT', async () => {
            logger.log('\\nShutting down services...')

            await seller.stop()
            for (const resolver of resolvers) {
                await resolver.stop()
            }

            logger.success('All services stopped.')
            process.exit(0)
        })
    } catch (error) {
        logger.error('Failed to start services:', error)
        process.exit(1)
    }
}

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        logger.error('Fatal error:', error)
        process.exit(1)
    })
}

export {main}
