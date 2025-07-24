import {z} from 'zod'
import Sdk from '@1inch/cross-chain-sdk'
import * as process from 'node:process'

const bool = z
    .string()
    .transform((v) => v.toLowerCase() === 'true')
    .pipe(z.boolean())

const ConfigSchema = z.object({
    SRC_CHAIN_RPC: z.string().url().optional(),
    DST_CHAIN_RPC: z.string().url().optional(),
    ETH_RPC: z.string().url().optional(),
    BSC_RPC: z.string().url().optional(),
    POLYGON_RPC: z.string().url().optional(),
    ARBITRUM_RPC: z.string().url().optional(),
    CREATE_FORK: bool.default('true')
})

const fromEnv = ConfigSchema.parse(process.env)

const chainConfigs = {
    ethereum: {
        chainId: Sdk.NetworkEnum.ETHEREUM,
        url: fromEnv.ETH_RPC || fromEnv.SRC_CHAIN_RPC || 'https://eth.merkle.io',
        createFork: fromEnv.CREATE_FORK,
        limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
        wrappedNative: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        ownerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        tokens: {
            USDC: {
                address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                donor: '0xd54F23BE482D9A58676590fCa79c8E43087f92fB'
            }
        }
    },
    base: {
        chainId: 84532, // Base Sepolia
        url: fromEnv.BASE_RPC || 'https://sepolia.base.org',
        createFork: fromEnv.CREATE_FORK,
        limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65', // Will need to verify this
        wrappedNative: '0x4200000000000000000000000000000000000006', // WETH on Base
        ownerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        tokens: {
            USDC: {
                address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
                donor: '0x0000000000000000000000000000000000000000' // Update with actual donor
            }
        }
    },
    polygon: {
        chainId: Sdk.NetworkEnum.POLYGON,
        url: fromEnv.POLYGON_RPC || 'https://polygon-rpc.com',
        createFork: fromEnv.CREATE_FORK,
        limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
        wrappedNative: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WMATIC
        ownerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        tokens: {
            USDC: {
                address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
                donor: '0xf977814e90da44bfa03b6295a0616a897441acec' // Binance hot wallet
            }
        }
    },
    arbitrum: {
        chainId: Sdk.NetworkEnum.ARBITRUM,
        url: fromEnv.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
        createFork: fromEnv.CREATE_FORK,
        limitOrderProtocol: '0x111111125421ca6dc452d289314280a0f8842a65',
        wrappedNative: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
        ownerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        tokens: {
            USDC: {
                address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
                donor: '0x489ee077994b6658eafa855c308275ead8097c4a' // Large USDC holder
            }
        }
    }
}

export const config = {
    chains: chainConfigs,
    // Legacy support
    chain: {
        source: chainConfigs.ethereum,
        destination: chainConfigs.base
    }
} as const

export type ChainConfig = (typeof config.chain)['source' | 'destination']
