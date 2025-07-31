import { AbiCoder, TypedDataEncoder, ZeroAddress } from 'ethers';
import * as Sdk from '@1inch/cross-chain-sdk';

// Create AbiCoder instance for ethers v6
const abiCoder = AbiCoder.defaultAbiCoder();

// Testnet chain IDs we support
const TESTNET_CHAINS: Record<number, string> = {
  11155111: 'eth_sepolia',
  84532: 'base_sepolia', 
  421614: 'arb_sepolia',
  10143: 'monad_testnet'
};

// Placeholder token addresses for testnets (can be any address, just needs to be consistent)
const TRUE_ERC20_TESTNET: Record<number, string> = {
  11155111: '0x0000000000000000000000000000000000000001', // Ethereum Sepolia
  84532: '0x0000000000000000000000000000000000000001',    // Base Sepolia
  421614: '0x0000000000000000000000000000000000000001',   // Arbitrum Sepolia
  10143: '0x0000000000000000000000000000000000000001'     // Monad Testnet
};

export interface TestnetCrossChainOrderParams {
  escrowFactory: string;
  limitOrderProtocol: string; // Address of LimitOrderProtocol on source chain
  salt: bigint;
  maker: string;
  makingAmount: bigint;
  takingAmount: bigint;
  makerAsset: string;
  takerAsset: string; // Actual destination token
  srcChainId: number;
  dstChainId: number;
  hashLock: string; // 32 bytes hex string
  timeLocks: {
    srcWithdrawal: bigint;
    srcPublicWithdrawal: bigint;
    srcCancellation: bigint;
    srcPublicCancellation: bigint;
    dstWithdrawal: bigint;
    dstPublicWithdrawal: bigint;
    dstCancellation: bigint;
  };
  srcSafetyDeposit: bigint;
  dstSafetyDeposit: bigint;
  auctionDetails: {
    initialRateBump: number;
    duration: bigint;
    startTime: bigint;
  };
  whitelist: Array<{ address: string; allowFrom: bigint }>;
  resolvingStartTime: bigint;
  nonce: bigint;
  allowPartialFills: boolean;
  allowMultipleFills: boolean;
}

export class TestnetCrossChainOrder {
  private params: TestnetCrossChainOrderParams;
  
  constructor(params: TestnetCrossChainOrderParams) {
    // Validate chains
    if (!TESTNET_CHAINS[params.srcChainId]) {
      throw new Error(`Unsupported source chain: ${params.srcChainId}`);
    }
    if (!TESTNET_CHAINS[params.dstChainId]) {
      throw new Error(`Unsupported destination chain: ${params.dstChainId}`);
    }
    if (params.srcChainId === params.dstChainId) {
      throw new Error('Source and destination chains must be different');
    }
    
    this.params = params;
  }
  
  // Encode time locks into uint256
  private encodeTimeLocks(): string {
    const { timeLocks } = this.params;
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Pack timelocks into uint256 (32 bits each)
    let packed = 0n;
    packed |= BigInt(currentTime + Number(timeLocks.srcWithdrawal)) << 224n;
    packed |= BigInt(currentTime + Number(timeLocks.srcCancellation)) << 192n;
    packed |= BigInt(currentTime + Number(timeLocks.srcPublicWithdrawal)) << 160n;
    packed |= BigInt(currentTime + Number(timeLocks.srcPublicCancellation)) << 128n;
    packed |= BigInt(currentTime + Number(timeLocks.dstWithdrawal)) << 96n;
    packed |= BigInt(currentTime + Number(timeLocks.dstCancellation)) << 64n;
    packed |= BigInt(currentTime + Number(timeLocks.dstPublicWithdrawal)) << 32n;
    packed |= BigInt(currentTime); // deployedAt
    
    return '0x' + packed.toString(16).padStart(64, '0');
  }
  
  // Build auction details for post interaction
  private buildAuctionDetails(): string {
    const { auctionDetails } = this.params;
    
    // For simple linear auction with no initial bump
    const points: Array<{ delay: number; coefficient: number }> = [];
    
    // Encode auction data
    const auctionData = abiCoder.encode(
      ['uint16', 'tuple(uint16,uint16)[]', 'uint32', 'uint32'],
      [
        auctionDetails.initialRateBump,
        points,
        auctionDetails.duration,
        auctionDetails.startTime
      ]
    );
    
    return auctionData;
  }
  
  // Build whitelist data
  private buildWhitelist(): string {
    if (this.params.whitelist.length === 0) {
      throw new Error('Whitelist cannot be empty');
    }
    
    // For ethers v6, we need to pass the data as an array of arrays
    const whitelistData = this.params.whitelist.map(w => [
      w.address,
      Number(w.allowFrom)
    ]);
    
    return abiCoder.encode(
      ['tuple(address,uint32)[]'],
      [whitelistData]
    );
  }
  
  // Build the extension field that contains postInteraction
  buildExtension(): string {
    // First, build the base post interaction data (auction + whitelist)
    const auctionData = this.buildAuctionDetails();
    const whitelistData = this.buildWhitelist();
    
    // Combine auction and whitelist
    const basePostInteraction = abiCoder.encode(
      ['bytes', 'bytes', 'uint32', 'uint32'],
      [
        auctionData,
        whitelistData,
        this.params.resolvingStartTime,
        0 // bankFee (not used in testnets)
      ]
    );
    
    // Build cross-chain specific extra data (160 bytes)
    const extraData = abiCoder.encode(
      ['bytes32', 'uint256', 'address', 'uint256', 'uint256'],
      [
        this.params.hashLock,
        this.params.dstChainId,
        this.params.takerAsset, // Actual destination token
        (this.params.srcSafetyDeposit << 128n) | this.params.dstSafetyDeposit,
        this.encodeTimeLocks()
      ]
    );
    
    // Combine base post interaction with extra data
    const fullPostInteraction = basePostInteraction + extraData.slice(2); // Remove 0x prefix
    
    // Build the complete extension
    const extension = abiCoder.encode(
      ['address', 'bytes', 'address', 'bytes'],
      [
        this.params.makerAsset, // makerAsset for validation
        '0x', // makerPermit (empty)
        this.params.escrowFactory, // postInteraction target
        fullPostInteraction // postInteraction data
      ]
    );
    
    return extension;
  }
  
  // Build order traits (flags and metadata)
  private buildMakerTraits(): string {
    let traits = 0n;
    
    // Set flags based on order parameters
    if (this.params.allowPartialFills) {
      traits |= 1n << 0n; // ALLOW_PARTIAL_FILLS flag
    }
    if (this.params.allowMultipleFills) {
      traits |= 1n << 1n; // ALLOW_MULTIPLE_FILLS flag
    }
    
    // Add nonce (40 bits) at position 24
    traits |= (this.params.nonce & ((1n << 40n) - 1n)) << 24n;
    
    // Add extension flag (required for orders with extensions)
    traits |= 1n << 255n; // HAS_EXTENSION flag
    
    return '0x' + traits.toString(16).padStart(64, '0');
  }
  
  // Build the order struct compatible with LimitOrderProtocol
  build(): any {
    const extension = this.buildExtension();
    const salt = '0x' + this.params.salt.toString(16).padStart(64, '0');
    
    return {
      salt: salt,
      maker: this.params.maker,
      receiver: ZeroAddress, // Will receive to maker
      makerAsset: this.params.makerAsset,
      takerAsset: TRUE_ERC20_TESTNET[this.params.srcChainId], // Placeholder token on source chain
      makingAmount: this.params.makingAmount.toString(),
      takingAmount: this.params.takingAmount.toString(),
      makerTraits: this.buildMakerTraits()
    };
  }
  
  // Get the order hash
  getOrderHash(chainId: number): string {
    const order = this.build();
    const domain = {
      name: "1inch Limit Order Protocol",
      version: "4",
      chainId: chainId,
      verifyingContract: this.params.limitOrderProtocol
    };
    
    const types = {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "receiver", type: "address" },
        { name: "makerAsset", type: "address" },
        { name: "takerAsset", type: "address" },
        { name: "makingAmount", type: "uint256" },
        { name: "takingAmount", type: "uint256" },
        { name: "makerTraits", type: "uint256" }
      ]
    };
    
    return TypedDataEncoder.hash(domain, types, order);
  }
  
  // Get extension data
  get extension(): string {
    return this.buildExtension();
  }
  
  // Convert to format expected by resolver
  toSrcImmutables(
    taker: string,
    fillAmount: bigint,
    hashLockOverride?: string
  ): any {
    const orderHash = this.getOrderHash(this.params.srcChainId);
    
    return {
      build: () => ({
        orderHash: orderHash,
        hashlock: hashLockOverride || this.params.hashLock,
        maker: this.params.maker,
        taker: taker,
        token: this.params.makerAsset,
        amount: fillAmount.toString(),
        safetyDeposit: this.params.srcSafetyDeposit.toString(),
        timelocks: this.encodeTimeLocks()
      }),
      
      // For creating destination immutables
      withComplement: (complement: any) => {
        return {
          build: () => ({
            orderHash: orderHash,
            hashlock: hashLockOverride || this.params.hashLock,
            maker: complement.maker,
            taker: complement.taker || taker,
            token: complement.token,
            amount: complement.amount.toString(),
            safetyDeposit: complement.safetyDeposit.toString(),
            timelocks: this.encodeTimeLocks()
          }),
          withTaker: (newTaker: string) => {
            return {
              build: () => ({
                orderHash: orderHash,
                hashlock: hashLockOverride || this.params.hashLock,
                maker: complement.maker,
                taker: newTaker,
                token: complement.token,
                amount: complement.amount.toString(),
                safetyDeposit: complement.safetyDeposit.toString(),
                timelocks: this.encodeTimeLocks()
              }),
              timeLocks: {
                toSrcTimeLocks: () => ({
                  privateCancellation: BigInt(Math.floor(Date.now() / 1000)) + this.params.timeLocks.srcCancellation
                })
              }
            };
          }
        };
      }
    };
  }
  
  // For compatibility with SDK usage
  get escrowExtension() {
    return {
      srcSafetyDeposit: this.params.srcSafetyDeposit,
      dstSafetyDeposit: this.params.dstSafetyDeposit,
      hashLockInfo: this.params.hashLock
    };
  }
}

// Helper to create order similar to SDK API
export function createTestnetCrossChainOrder(
  escrowFactory: string,
  limitOrderProtocol: string,
  orderInfo: {
    salt: bigint;
    maker: string;
    makingAmount: bigint;
    takingAmount: bigint;
    makerAsset: string;
    takerAsset: string;
  },
  escrowParams: {
    hashLock: string;
    timeLocks: any;
    srcChainId: number;
    dstChainId: number;
    srcSafetyDeposit: bigint;
    dstSafetyDeposit: bigint;
  },
  settlementParams: {
    auction: {
      initialRateBump: number;
      points?: any[];
      duration: bigint;
      startTime: bigint;
    };
    whitelist: Array<{ address: string; allowFrom: bigint }>;
    resolvingStartTime: bigint;
  },
  flags: {
    nonce: bigint;
    allowPartialFills: boolean;
    allowMultipleFills: boolean;
  }
): TestnetCrossChainOrder {
  return new TestnetCrossChainOrder({
    escrowFactory,
    limitOrderProtocol,
    ...orderInfo,
    ...escrowParams,
    auctionDetails: settlementParams.auction,
    whitelist: settlementParams.whitelist,
    resolvingStartTime: settlementParams.resolvingStartTime,
    ...flags
  });
}