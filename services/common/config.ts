import {ethers} from 'ethers'
import dotenv from 'dotenv'
import { loadDeployments, getContractAddress } from './deployment-loader'

// Load environment variables first
dotenv.config()

// Load deployment addresses
const deployments = loadDeployments()

export const CHAINS = {
    ethereum_sepolia: {
        rpc: deployments[11155111]?.rpcUrl || `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || 'demo'}`,
        chainId: 11155111,
        escrowFactory: getContractAddress(11155111, 'uniteEscrowFactory') || '0x66AEACCcF67b99E96831f60F821377010aF9B763',
        relayerContract: getContractAddress(11155111, 'relayerContract') || '0x0000000000000000000000000000000000000000',
        limitOrderProtocol: getContractAddress(11155111, 'limitOrderProtocol') || '0x0000000000000000000000000000000000000000'
    },
    base_sepolia: {
        rpc: deployments[84532]?.rpcUrl || `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || 'demo'}`,
        chainId: 84532,
        escrowFactory: getContractAddress(84532, 'uniteEscrowFactory') || '0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9',
        relayerContract: getContractAddress(84532, 'relayerContract') || '0x0000000000000000000000000000000000000000',
        limitOrderProtocol: getContractAddress(84532, 'limitOrderProtocol') || '0x0000000000000000000000000000000000000000'
    },
    arbitrum_sepolia: {
        rpc: deployments[421614]?.rpcUrl || `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || 'demo'}`,
        chainId: 421614,
        escrowFactory: getContractAddress(421614, 'uniteEscrowFactory') || '0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9',
        relayerContract: getContractAddress(421614, 'relayerContract') || '0x0000000000000000000000000000000000000000',
        limitOrderProtocol: getContractAddress(421614, 'limitOrderProtocol') || '0x0000000000000000000000000000000000000000'
    },
    // Etherlink testnet disabled due to insufficient funds
    // etherlink_testnet: {
    //     rpc: deployments[128123]?.rpcUrl || 'https://rpc.ankr.com/etherlink_testnet',
    //     chainId: 128123,
    //     escrowFactory: getContractAddress(128123, 'uniteEscrowFactory') || '0x0000000000000000000000000000000000000000',
    //     relayerContract: getContractAddress(128123, 'relayerContract') || '0x0000000000000000000000000000000000000000',
    //     limitOrderProtocol: getContractAddress(128123, 'limitOrderProtocol') || '0x0000000000000000000000000000000000000000'
    // },
    monad_testnet: {
        rpc: deployments[10143]?.rpcUrl || 'https://testnet-rpc.monad.xyz',
        chainId: 10143,
        escrowFactory: getContractAddress(10143, 'uniteEscrowFactory') || '0x0000000000000000000000000000000000000000',
        relayerContract: getContractAddress(10143, 'relayerContract') || '0x0000000000000000000000000000000000000000',
        limitOrderProtocol: getContractAddress(10143, 'limitOrderProtocol') || '0x0000000000000000000000000000000000000000'
    }
}

export const AUCTION_ABI = [
    'event AuctionCreated(bytes32 indexed auctionId, address indexed seller, address token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 duration)',
    'event AuctionSettled(bytes32 indexed auctionId, address indexed buyer, uint256 price)',
    'event AuctionCancelled(bytes32 indexed auctionId)',
    'function createAuction(bytes32 auctionId, address token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 duration) external',
    'function getCurrentPrice(bytes32 auctionId) external view returns (uint256)',
    'function settleAuction(bytes32 auctionId) external payable',
    'function getAuction(bytes32 auctionId) external view returns (address seller, address token, uint256 amount, uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 duration, bool isActive)'
]

export const ERC20_ABI = [
    'function balanceOf(address account) external view returns (uint256)',
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)'
]

export interface AuctionInfo {
    auctionId: string
    seller: string
    token: string
    amount: ethers.BigNumberish
    startPrice: ethers.BigNumberish
    endPrice: ethers.BigNumberish
    startTime: number
    duration: number
    chain: string
}

export interface ResolverConfig {
    id: string
    privateKey: string
    maxPriceWei: string
    minBalanceWei: string
    competitionDelayMs: number
    chains: string[]
}

export const TEST_TOKEN = '0x0000000000000000000000000000000000000000' // ETH
export const TEST_AMOUNT = ethers.parseEther('0.001') // 0.001 ETH
export const TEST_START_PRICE = ethers.parseEther('0.002') // 0.002 ETH per unit
export const TEST_END_PRICE = ethers.parseEther('0.0005') // 0.0005 ETH per unit
export const TEST_DURATION = 300 // 5 minutes

export interface ChainConfig {
    chainId: number
    name: string
    rpcUrl: string
}

export function getChainConfigs(): ChainConfig[] {
    return [
        {
            chainId: CHAINS.base_sepolia.chainId,
            name: 'Base Sepolia',
            rpcUrl: CHAINS.base_sepolia.rpc
        },
        {
            chainId: CHAINS.arbitrum_sepolia.chainId,
            name: 'Arbitrum Sepolia',
            rpcUrl: CHAINS.arbitrum_sepolia.rpc
        },
        {
            chainId: CHAINS.ethereum_sepolia.chainId,
            name: 'Ethereum Sepolia',
            rpcUrl: CHAINS.ethereum_sepolia.rpc
        },
        // Etherlink testnet disabled
        // {
        //     chainId: CHAINS.etherlink_testnet.chainId,
        //     name: 'Etherlink Testnet',
        //     rpcUrl: CHAINS.etherlink_testnet.rpc
        // },
        {
            chainId: CHAINS.monad_testnet.chainId,
            name: 'Monad Testnet',
            rpcUrl: CHAINS.monad_testnet.rpc
        }
    ]
}
