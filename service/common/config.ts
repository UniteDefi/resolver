import {ethers} from 'ethers'
import dotenv from 'dotenv'
import { loadDeployments, getContractAddress } from './deployment-loader'

// Load environment variables first
dotenv.config()

// Load deployment addresses from EVM partial deployments
const deployments = loadDeployments()

export const CHAINS = {
    ethereum_sepolia: {
        rpc: process.env.SEPOLIA_RPC_URL || deployments[11155111]?.rpcUrl || `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_SEPOLIA_API_KEY || 'demo'}`,
        chainId: 11155111,
        escrowFactory: getContractAddress(11155111, 'UniteEscrowFactory') || '0x2e9c03F9822B5Ee1dE75541b78DAd1577F243ECC',
        limitOrderProtocol: getContractAddress(11155111, 'UniteLimitOrderProtocol') || '0x0127ceF16C590Ec8d12B00Ca9fdA4f703a34b454',
        resolverContracts: [
            getContractAddress(11155111, 'UniteResolver0') || '0x2F854ac69B834BF78eb1ce3d13ff66585bd7143b',
            getContractAddress(11155111, 'UniteResolver1') || '0xddfa66c022fda258448AbB81a88B2359941641DF',
            getContractAddress(11155111, 'UniteResolver2') || '0xeF9143C4b9f6e40E98a458810DFbeE0C5a13200C',
            getContractAddress(11155111, 'UniteResolver3') || '0x0CF0c1170cA7E11c626366fBd3E2d63A869A6EfA'
        ],
        mockTokens: {
            usdt: getContractAddress(11155111, 'MockUSDT') || '0xD3A558Ce7b810bA17FF9Ce626FE82887f27CB976',
            dai: getContractAddress(11155111, 'MockDAI') || '0x0a0F303C316F2421f10fd9dA8811b250A3Dc7834',
            wrappedNative: getContractAddress(11155111, 'MockWrappedNative') || '0xbc0023f0A0CEe591Cb7399867C9AF4E9c9bbD38A'
        }
    },
    base_sepolia: {
        rpc: process.env.BASE_SEPOLIA_RPC_URL || deployments[84532]?.rpcUrl || `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_BASE_SEPOLIA_API_KEY || 'demo'}`,
        chainId: 84532,
        escrowFactory: getContractAddress(84532, 'UniteEscrowFactory') || '0xbd8ce7E7B9F70275DbCB9441aE7b5CA4F472305d',
        limitOrderProtocol: getContractAddress(84532, 'UniteLimitOrderProtocol') || '0x734F3DDcE982B1b966B4234C53a1365D44980692',
        resolverContracts: [
            getContractAddress(84532, 'UniteResolver0') || '0x70de6F2Db310a9b7725597619E330061542a6a49',
            getContractAddress(84532, 'UniteResolver1') || '0x5cE6D9374c66742D25a08A718FF5e99728427008',
            getContractAddress(84532, 'UniteResolver2') || '0x531B38CB2930dc6BF0dcB9678E02A61b926D0c87',
            getContractAddress(84532, 'UniteResolver3') || '0x006cca7e620908E42F921D6B821A4C604A6a4f5C'
        ],
        mockTokens: {
            usdt: getContractAddress(84532, 'MockUSDT') || '0x5bab363F119b712F18Bb8d4fC6915f5bBB73Bc3f',
            dai: getContractAddress(84532, 'MockDAI') || '0x0f3DE654D774EF228aF8705ced579CB92b7d776c',
            wrappedNative: getContractAddress(84532, 'MockWrappedNative') || '0xd78420cD15e24b54623ddFe53b4226AB1875579B'
        }
    },
    arbitrum_sepolia: {
        rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL || deployments[421614]?.rpcUrl || `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_SEPOLIA_API_KEY || 'demo'}`,
        chainId: 421614,
        escrowFactory: getContractAddress(421614, 'UniteEscrowFactory') || '0x606f19a1a58D73C5a6E2A33934731977e9c602f1',
        limitOrderProtocol: getContractAddress(421614, 'UniteLimitOrderProtocol') || '0x9C04003f13447ecb51651B74966Edf196F2AD1C5',
        resolverContracts: [
            getContractAddress(421614, 'UniteResolver0') || '0x854a01fd8591156A4eFc8C817a9B2b697461ef5D',
            getContractAddress(421614, 'UniteResolver1') || '0xD00915c1E73D875ECd3eF3abE7AcC126dcCe1b34',
            getContractAddress(421614, 'UniteResolver2') || '0x0e5f5C396C1fc75523Ddff392d4F355eBAc39f5F',
            getContractAddress(421614, 'UniteResolver3') || '0xC58E959d42c3F7A935030599DC71Bd8FbebAa898'
        ],
        mockTokens: {
            usdt: getContractAddress(421614, 'MockUSDT') || '0x30ad93E8EeA74fd5Ee552f57E594407E084EFD8F',
            dai: getContractAddress(421614, 'MockDAI') || '0x33C166c2E8966Eb34D366C764cfA9D31b62d4d3e',
            wrappedNative: getContractAddress(421614, 'MockWrappedNative') || '0x37a7a300c823bA1f95C900245926f4CEa9cf1c7D'
        }
    },
    etherlink_testnet: {
        rpc: process.env.ETHERLINK_TESTNET_RPC_URL || deployments[128123]?.rpcUrl || 'https://node.ghostnet.etherlink.com',
        chainId: 128123,
        escrowFactory: getContractAddress(128123, 'UniteEscrowFactory') || '0xDC6B406d93E6D1180FC1aCe41734919F8D1d2a0A',
        limitOrderProtocol: getContractAddress(128123, 'UniteLimitOrderProtocol') || '0x40D4631c4Ec8C8c95321c57dE1D23D1d9a5e80ED',
        resolverContracts: [
            getContractAddress(128123, 'UniteResolver0') || '0x12A1249be3dCf21bc576e7DB3F5AeA1209820fA4',
            getContractAddress(128123, 'UniteResolver1') || '0x6f6574fAEE0cc1b71E8012aC01Bc5Dcf3282e615',
            getContractAddress(128123, 'UniteResolver2') || '0x5518562c0A8474C080D3c9dBC5B1AE71a44644E7',
            getContractAddress(128123, 'UniteResolver3') || '0xeC5b1d97869FB76B2E38F920cd033f26141dF6B7'
        ],
        mockTokens: {
            usdt: getContractAddress(128123, 'MockUSDT') || '0x099935623F5E4680606f1946Bc618cd4Ea5A10E4',
            dai: getContractAddress(128123, 'MockDAI') || '0x2731891fbA462E13b0296fFec8651648c7C51864',
            wrappedNative: getContractAddress(128123, 'MockWrappedNative') || '0x2ce322e769460f595160450835C81A72aA34eFFE'
        }
    },
    monad_testnet: {
        rpc: process.env.MONAD_TESTNET_RPC_URL || deployments[10143]?.rpcUrl || 'https://rpc.ankr.com/monad_testnet',
        chainId: 10143,
        escrowFactory: getContractAddress(10143, 'UniteEscrowFactory') || '0xd8F232cEB1A1701F385E1f7E724b9Ba0EeBfBa80',
        limitOrderProtocol: getContractAddress(10143, 'UniteLimitOrderProtocol') || '0x41afd10F4b3407770b5195C75136FFa5628288C8',
        resolverContracts: [
            getContractAddress(10143, 'UniteResolver0') || '0x3834D3892CC702F05cd78316F5515cc5a5c87f2B',
            getContractAddress(10143, 'UniteResolver1') || '0x3049B96F03857cB09bF4F095954aEC8c2D05Ba37',
            getContractAddress(10143, 'UniteResolver2') || '0x93093Fd1CcEb9462e69191115A4E3F1A798955BF',
            getContractAddress(10143, 'UniteResolver3') || '0x81207721E1F6b1F1356cBDd6f4f039312Cd77013'
        ],
        mockTokens: {
            usdt: getContractAddress(10143, 'MockUSDT') || '0x49575c658600B37C3F960d615203c30804524270',
            dai: getContractAddress(10143, 'MockDAI') || '0x011B6cE3451aceDCB841902751a0cF62a7fF33C5',
            wrappedNative: getContractAddress(10143, 'MockWrappedNative') || '0x7C0d174Ce3c22179Cd2a8bB1fDE6812C6E7Df0bC'
        }
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
        {
            chainId: CHAINS.etherlink_testnet.chainId,
            name: 'Etherlink Testnet',
            rpcUrl: CHAINS.etherlink_testnet.rpc
        },
        {
            chainId: CHAINS.monad_testnet.chainId,
            name: 'Monad Testnet',
            rpcUrl: CHAINS.monad_testnet.rpc
        }
    ]
}

// Resolver configuration based on environment
export function getResolverConfig(): {
    index: number;
    privateKey: string;
    address: string;
} {
    const resolverIndex = parseInt(process.env.RESOLVER_INDEX || '0');
    const privateKeys = [
        process.env.RESOLVER_PRIVATE_KEY_0!,
        process.env.RESOLVER_PRIVATE_KEY_1!,
        process.env.RESOLVER_PRIVATE_KEY_2!,
        process.env.RESOLVER_PRIVATE_KEY_3!
    ];
    
    const addresses = [
        process.env.RESOLVER_WALLET_0!,
        process.env.RESOLVER_WALLET_1!,
        process.env.RESOLVER_WALLET_2!,
        process.env.RESOLVER_WALLET_3!
    ];
    
    if (resolverIndex < 0 || resolverIndex > 3) {
        throw new Error(`Invalid RESOLVER_INDEX ${resolverIndex}. Must be 0-3.`);
    }
    
    return {
        index: resolverIndex,
        privateKey: privateKeys[resolverIndex],
        address: addresses[resolverIndex]
    };
}

// Get resolver contract address for a specific chain and resolver index
export function getResolverContractAddress(chainId: number, resolverIndex: number): string {
    const chainKey = Object.keys(CHAINS).find(key => CHAINS[key].chainId === chainId);
    if (!chainKey) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    
    const chain = CHAINS[chainKey];
    if (!chain.resolverContracts[resolverIndex]) {
        throw new Error(`Resolver ${resolverIndex} not found for chain ${chainId}`);
    }
    
    return chain.resolverContracts[resolverIndex];
}
