import { Contract, Wallet, JsonRpcProvider } from "ethers";

export interface EVMConfig {
    chainId: number;
    rpcUrl: string;
    contracts: {
        limitOrderProtocol: string;
        escrowFactory: string;
        resolvers: string[];
        tokens: {
            usdt: string;
            dai: string;
            wrappedNative: string;
        };
    };
}

export const BASE_SEPOLIA_CONFIG: EVMConfig = {
    chainId: 84532,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    contracts: {
        limitOrderProtocol: process.env.BASE_SEPOLIA_LOP || "0x0000000000000000000000000000000000000000",
        escrowFactory: process.env.BASE_SEPOLIA_FACTORY || "0x0000000000000000000000000000000000000000",
        resolvers: [
            process.env.BASE_SEPOLIA_RESOLVER_0 || "0x0000000000000000000000000000000000000000",
            process.env.BASE_SEPOLIA_RESOLVER_1 || "0x0000000000000000000000000000000000000000",
            process.env.BASE_SEPOLIA_RESOLVER_2 || "0x0000000000000000000000000000000000000000"
        ],
        tokens: {
            usdt: process.env.BASE_SEPOLIA_USDT || "0x0000000000000000000000000000000000000000",
            dai: process.env.BASE_SEPOLIA_DAI || "0x0000000000000000000000000000000000000000",
            wrappedNative: process.env.BASE_SEPOLIA_WETH || "0x0000000000000000000000000000000000000000"
        }
    }
};

// EVM Contract ABIs
export const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

export const ESCROW_FACTORY_ABI = [
    "function createDstEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp, uint256 partialAmount, address resolver) external payable returns (address)",
    "function getTotalFilledAmount(bytes32 orderHash) external view returns (uint256)",
    "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)"
];

export const ESCROW_ABI = [
    "function withdrawWithSecret(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
    "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external"
];

export interface EVMWallets {
    user: Wallet;
    resolvers: Wallet[];
    relayer?: Wallet;
}

export function createEVMProvider(config: EVMConfig): JsonRpcProvider {
    return new JsonRpcProvider(config.rpcUrl);
}

export function createEVMWallets(provider: JsonRpcProvider, privateKeys: string[]): EVMWallets {
    return {
        user: new Wallet(privateKeys[0], provider),
        resolvers: privateKeys.slice(1, 4).map(key => new Wallet(key, provider)),
        relayer: privateKeys[4] ? new Wallet(privateKeys[4], provider) : undefined
    };
}

export async function checkEVMBalances(wallets: EVMWallets, tokenAddress: string): Promise<void> {
    const token = new Contract(tokenAddress, ERC20_ABI, wallets.user);
    
    console.log("📊 EVM Token Balances:");
    const userBalance = await token.balanceOf(wallets.user.address);
    console.log(`  User: ${userBalance.toString()}`);
    
    for (let i = 0; i < wallets.resolvers.length; i++) {
        const balance = await token.balanceOf(wallets.resolvers[i].address);
        console.log(`  Resolver ${i}: ${balance.toString()}`);
    }
}

export function encodeTimelocks(timelocks: any): bigint {
    let encoded = 0n;
    encoded |= BigInt(timelocks.srcWithdrawal & 0xFFFFFFFF);
    encoded |= BigInt(timelocks.srcPublicWithdrawal & 0xFFFFFFFF) << 32n;
    encoded |= BigInt(timelocks.srcCancellation & 0xFFFFFFFF) << 64n;
    encoded |= BigInt(timelocks.srcPublicCancellation & 0xFFFFFFFF) << 96n;
    encoded |= BigInt(timelocks.dstWithdrawal & 0xFFFFFFFF) << 128n;
    encoded |= BigInt(timelocks.dstPublicWithdrawal & 0xFFFFFFFF) << 160n;
    encoded |= BigInt(timelocks.dstCancellation & 0xFFFFFFFF) << 192n;
    return encoded;
}
