import {ResolverConfig} from '../cross_chain_resolver'
import dotenv from 'dotenv'

dotenv.config()

export const CROSS_CHAIN_CONFIG: ResolverConfig = {
    id: process.env.RESOLVER_ID || 'resolver-1',
    privateKey: process.env.RESOLVER_PRIVATE_KEY || '',
    relayerApiUrl: process.env.RELAYER_API_URL || 'http://localhost:3000',
    maxAcceptablePrice: process.env.MAX_ACCEPTABLE_PRICE || '0.005', // Maximum price willing to accept
    minSafetyDeposit: process.env.MIN_SAFETY_DEPOSIT || '0.01', // Minimum safety deposit in native tokens
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 10000, // Poll every 10 seconds
    chains: {
        11155111: {
            // Sepolia
            name: 'Ethereum Sepolia',
            rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com',
            escrowFactory: process.env.SEPOLIA_ESCROW_FACTORY || '',
            nativeTokenDecimals: 18
        },
        84532: {
            // Base Sepolia
            name: 'Base Sepolia',
            rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
            escrowFactory: process.env.BASE_SEPOLIA_ESCROW_FACTORY || '',
            nativeTokenDecimals: 18
        },
        421614: {
            // Arbitrum Sepolia
            name: 'Arbitrum Sepolia',
            rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
            escrowFactory: process.env.ARBITRUM_SEPOLIA_ESCROW_FACTORY || '',
            nativeTokenDecimals: 18
        }
    }
}

// Validation function to ensure required environment variables are set
export function validateConfig(): void {
    const requiredVars = ['RESOLVER_PRIVATE_KEY', 'RELAYER_API_URL']

    const missing = requiredVars.filter((varName) => !process.env[varName])

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
    }

    // Check that at least one chain has an escrow factory configured
    const configuredChains = Object.values(CROSS_CHAIN_CONFIG.chains).filter(
        (chain) => chain.escrowFactory && chain.escrowFactory !== ''
    )

    if (configuredChains.length === 0) {
        console.warn(
            'Warning: No escrow factories configured. Please set environment variables for escrow factory addresses.'
        )
    }
}
