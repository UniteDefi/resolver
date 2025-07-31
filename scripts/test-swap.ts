#!/usr/bin/env ts-node

import { ethers } from 'ethers';
import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import chalk from 'chalk';
import * as Sdk from '@1inch/cross-chain-sdk';
import { uint8ArrayToHex, UINT_40_MAX } from '@1inch/byte-utils';
import { createTestnetCrossChainOrder } from './utils/testnet-cross-chain-order';

// Load environment variables
dotenv.config({ path: '../.env' });

// Load deployments
import deployments from '../deployments.json';

// Types from relayer
interface HTLCOrder {
  userAddress: string;
  srcChainId: number;
  srcToken: string;
  srcAmount: string;
  dstChainId: number;
  dstToken: string;
  secretHash: string;
  minAcceptablePrice: string;
  orderDuration: number;
  nonce: string;
  deadline: number;
}

// Get deployments for each chain
interface Deployments {
  [chainId: number]: {
    escrowFactory: string;
    limitOrderProtocol: string;
    resolvers: string[];
    usdt: string;
    dai: string;
    wrappedNative: string;
  };
}

// Chain configurations
const CHAIN_CONFIGS: Record<string, {
  chainId: number;
  name: string;
  rpcUrl: string;
  deployments: any;
}> = {
  'eth_sepolia': {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    rpcUrl: process.env.SEPOLIA_RPC_URL!,
    deployments: deployments.evm.eth_sepolia
  },
  'base_sepolia': {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!,
    deployments: deployments.evm.base_sepolia
  },
  'arb_sepolia': {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL!,
    deployments: deployments.evm.arb_sepolia
  },
  'monad_testnet': {
    chainId: 10143,
    name: 'Monad Testnet',
    rpcUrl: process.env.MONAD_TESTNET_RPC_URL!,
    deployments: deployments.evm.monad_testnet
  }
};

// Token configurations
const TOKEN_CONFIGS: Record<string, {
  contractKey: string;
  decimals: number;
  name: string;
}> = {
  'USDT': { 
    contractKey: 'MockERC20', 
    decimals: 6,
    name: 'USDT'
  },
  'DAI': { 
    contractKey: 'MockERC20_2', 
    decimals: 18,
    name: 'DAI'
  },
  'WETH': { 
    contractKey: 'MockWrappedNative', 
    decimals: 18,
    name: 'Wrapped Native'
  }
};

// ERC20 ABI
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// EIP-712 Types
const HTLCOrder = [
  { name: "userAddress", type: "address" },
  { name: "srcChainId", type: "uint256" },
  { name: "srcToken", type: "address" },
  { name: "srcAmount", type: "uint256" },
  { name: "dstChainId", type: "uint256" },
  { name: "dstToken", type: "address" },
  { name: "secretHash", type: "bytes32" },
  { name: "minAcceptablePrice", type: "uint256" },
  { name: "orderDuration", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" }
];

class CrossChainSwapTester {
  private userWallet: ethers.Wallet;
  private relayerUrl: string;

  constructor() {
    const privateKey = process.env.USER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('USER_PRIVATE_KEY not found in environment');
    }
    this.userWallet = new ethers.Wallet(privateKey);
    this.relayerUrl = process.env.RELAYER_API_URL || 'http://localhost:3000';
  }

  async executeSwap(options: {
    from: string;
    to: string;
    token: string;
    amount: number;
    secret?: string;
  }) {
    console.log(chalk.blue('\n=== Unite DeFi Cross-Chain Swap Test ===\n'));

    // Validate chains
    const srcChain = CHAIN_CONFIGS[options.from as string];
    const dstChain = CHAIN_CONFIGS[options.to as string];
    
    if (!srcChain || !dstChain) {
      throw new Error('Invalid chain specified');
    }

    // Validate token
    const tokenConfig = TOKEN_CONFIGS[(options.token as string).toUpperCase()];
    if (!tokenConfig) {
      throw new Error('Invalid token specified');
    }

    // Generate or use provided secret
    const secret = options.secret || Math.random().toString(36).substring(2, 15);
    const secretBytes32 = ethers.utils.formatBytes32String(secret);
    const secretHash = ethers.utils.keccak256(secretBytes32);

    console.log(chalk.gray('Configuration:'));
    console.log(`  From: ${srcChain.name} (${options.from})`);
    console.log(`  To: ${dstChain.name} (${options.to})`);
    console.log(`  Token: ${tokenConfig.name}`);
    console.log(`  Amount: ${options.amount}`);
    console.log(`  User: ${this.userWallet.address}`);
    console.log(`  Secret: ${secret}`);
    console.log(`  Secret Hash: ${secretHash}`);
    console.log('');

    // Setup providers and contracts
    const srcProvider = new ethers.providers.JsonRpcProvider(srcChain.rpcUrl);
    const dstProvider = new ethers.providers.JsonRpcProvider(dstChain.rpcUrl);
    
    const srcWallet = this.userWallet.connect(srcProvider);
    const dstWallet = this.userWallet.connect(dstProvider);

    const srcTokenAddress = srcChain.deployments[tokenConfig.contractKey];
    const dstTokenAddress = dstChain.deployments[tokenConfig.contractKey];
    const escrowFactoryAddress = srcChain.deployments.UniteEscrowFactory;

    const srcToken = new ethers.Contract(srcTokenAddress, ERC20_ABI, srcWallet);
    const dstToken = new ethers.Contract(dstTokenAddress, ERC20_ABI, dstProvider);

    // Step 1: Check and display initial balances
    console.log(chalk.yellow('Step 1: Checking initial balances...'));
    const srcBalance = await srcToken.balanceOf(this.userWallet.address);
    const dstBalance = await dstToken.balanceOf(this.userWallet.address);
    
    console.log(`  Source balance: ${ethers.utils.formatUnits(srcBalance, tokenConfig.decimals)} ${tokenConfig.name}`);
    console.log(`  Destination balance: ${ethers.utils.formatUnits(dstBalance, tokenConfig.decimals)} ${tokenConfig.name}`);
    console.log('');

    // Convert amount to wei/smallest unit
    const amountWei = ethers.utils.parseUnits(options.amount.toString(), tokenConfig.decimals);

    // Step 2: Approve UniteEscrowFactory
    console.log(chalk.yellow('Step 2: Approving UniteEscrowFactory...'));
    const currentAllowance = await srcToken.allowance(this.userWallet.address, escrowFactoryAddress);
    
    if (currentAllowance.lt(amountWei)) {
      const approveTx = await srcToken.approve(escrowFactoryAddress, amountWei);
      console.log(`  Approval tx: ${approveTx.hash}`);
      await approveTx.wait();
      console.log(chalk.green('  ✓ Approval confirmed'));
    } else {
      console.log(chalk.green('  ✓ Already approved'));
    }
    console.log('');

    // Step 3: Create and sign order
    console.log(chalk.yellow('Step 3: Creating and signing order...'));
    
    // Calculate minimum acceptable price (0.95 for 5% slippage on 1:1 stablecoins)
    // Price is represented with 6 decimals, so 0.95 = 950000
    const minAcceptablePrice = ethers.utils.parseUnits("0.95", 6);
    
    // Get current timestamp for auction
    const currentBlock = await srcProvider.getBlock('latest');
    const srcTimestamp = BigInt(currentBlock!.timestamp);
    
    // Calculate destination amount based on min acceptable price
    const dstAmount = amountWei.mul(minAcceptablePrice).div(ethers.utils.parseUnits("1", 6));
    
    // Create cross-chain order using testnet-compatible helper
    const order = createTestnetCrossChainOrder(
      escrowFactoryAddress,
      srcChain.deployments.LimitOrderProtocol,
      {
        salt: BigInt(Math.floor(Math.random() * 1000)),
        maker: this.userWallet.address,
        makingAmount: BigInt(amountWei.toString()),
        takingAmount: BigInt(dstAmount.toString()),
        makerAsset: srcTokenAddress,
        takerAsset: dstTokenAddress,
      },
      {
        hashLock: secretHash, // Using keccak256 hash directly
        timeLocks: {
          srcWithdrawal: 300n, // 5 minutes
          srcPublicWithdrawal: 600n, // 10 minutes
          srcCancellation: 900n, // 15 minutes
          srcPublicCancellation: 1200n, // 20 minutes
          dstWithdrawal: 300n, // 5 minutes
          dstPublicWithdrawal: 600n, // 10 minutes
          dstCancellation: 900n, // 15 minutes
        },
        srcChainId: srcChain.chainId,
        dstChainId: dstChain.chainId,
        srcSafetyDeposit: BigInt(ethers.utils.parseUnits("0.01", 18).toString()),
        dstSafetyDeposit: BigInt(ethers.utils.parseUnits("0.01", 18).toString()),
      },
      {
        auction: {
          initialRateBump: 0,
          duration: 300n, // 5 minutes auction
          startTime: srcTimestamp,
        },
        whitelist: [
          {
            address: srcChain.deployments.Resolver,
            allowFrom: 0n,
          },
          {
            address: srcChain.deployments.Resolver_2,
            allowFrom: 0n,
          },
          {
            address: srcChain.deployments.Resolver_3,
            allowFrom: 0n,
          },
          {
            address: srcChain.deployments.Resolver_4,
            allowFrom: 0n,
          },
        ],
        resolvingStartTime: 0n,
      },
      {
        nonce: BigInt(Math.floor(Math.random() * 2**40)),
        allowPartialFills: false,
        allowMultipleFills: false,
      }
    );
    
    const orderHash = order.getOrderHash(srcChain.chainId);
    console.log('  Order hash:', orderHash);
    
    // Sign the order with EIP-712
    const domain = {
      name: "1inch Limit Order Protocol",
      version: "4",
      chainId: srcChain.chainId,
      verifyingContract: srcChain.deployments.LimitOrderProtocol,
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
        { name: "makerTraits", type: "uint256" },
      ],
    };
    
    const orderData = order.build();
    const signature = await srcWallet._signTypedData(domain, types, orderData);
    console.log(`  Signature: ${signature}`);
    console.log(chalk.green('  ✓ Order signed'));
    console.log('');

    // Step 4: Submit order to relayer
    console.log(chalk.yellow('Step 4: Submitting order to relayer...'));
    
    try {
      // Create HTLCOrder format for relayer (compatibility layer)
      const htlcOrder: HTLCOrder = {
        userAddress: this.userWallet.address,
        srcChainId: srcChain.chainId,
        srcToken: srcTokenAddress,
        srcAmount: amountWei.toString(),
        dstChainId: dstChain.chainId,
        dstToken: dstTokenAddress,
        secretHash: secretHash,
        minAcceptablePrice: minAcceptablePrice.toString(),
        orderDuration: 300,
        nonce: orderData.salt.toString(),
        deadline: Number(srcTimestamp) + 3600 // 1 hour deadline
      };
      
      const response = await axios.post(`${this.relayerUrl}/api/create-swap`, {
        htlcOrder,
        signature,
        secret,
        // Also send SDK order data for enhanced compatibility
        sdkOrder: {
          orderData: orderData,
          orderHash: orderHash,
          extension: order.extension
        }
      });

      const orderId = response.data.orderId;
      console.log(chalk.green(`  ✓ Order submitted: ${orderId}`));
      console.log('');

      // Step 5: Monitor order execution
      console.log(chalk.yellow('Step 5: Monitoring order execution...'));
      await this.monitorOrder(orderId, srcProvider, dstProvider, dstToken, tokenConfig.decimals);
      
      // Final balance check
      console.log(chalk.yellow('\nFinal balance check...'));
      const finalDstBalance = await dstToken.balanceOf(this.userWallet.address);
      const received = finalDstBalance.sub(dstBalance);
      
      console.log(`  Received: ${ethers.utils.formatUnits(received, tokenConfig.decimals)} ${tokenConfig.name}`);
      console.log(chalk.green('\n✓ Cross-chain swap completed successfully!'));
      
    } catch (error: any) {
      console.error(chalk.red('Error submitting order:'));
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.error('Error:', error.message);
      }
      throw error;
    }
  }

  private async monitorOrder(
    orderId: string, 
    srcProvider: ethers.providers.JsonRpcProvider,
    dstProvider: ethers.providers.JsonRpcProvider,
    dstToken: ethers.Contract,
    decimals: number
  ): Promise<void> {
    let lastStatus = '';
    const startTime = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes timeout

    while (true) {
      try {
        const response = await axios.get(`${this.relayerUrl}/api/order-status/${orderId}`);
        const order = response.data;

        if (order.status !== lastStatus) {
          lastStatus = order.status;
          console.log(chalk.cyan(`  Status: ${order.status}`));

          switch (order.status) {
            case 'committed':
              console.log(`    Resolver committed: ${order.resolver}`);
              console.log(`    Price: ${ethers.utils.formatUnits(order.committedPrice || '0', decimals)}`);
              break;
            case 'settling':
              console.log(`    Escrows deployed`);
              console.log(`    Source: ${order.srcEscrowAddress}`);
              console.log(`    Destination: ${order.dstEscrowAddress}`);
              break;
            case 'completed':
              console.log(chalk.green('    ✓ Swap completed!'));
              return;
            case 'failed':
              console.log(chalk.red('    ✗ Swap failed'));
              throw new Error('Swap failed');
          }
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error('Order execution timeout');
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error: any) {
        if (error.response?.status === 404) {
          console.error(chalk.red('Order not found'));
          throw error;
        }
        // Retry on other errors
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

// CLI setup
const program = new Command();

program
  .name('test-swap')
  .description('Test cross-chain swap on Unite DeFi')
  .requiredOption('--from <chain>', 'Source chain (eth_sepolia, base_sepolia, arb_sepolia, monad_testnet)')
  .requiredOption('--to <chain>', 'Destination chain')
  .requiredOption('--token <token>', 'Token to swap (USDT, DAI, WETH)')
  .requiredOption('--amount <amount>', 'Amount to swap', parseFloat)
  .option('--secret <secret>', 'Custom secret (optional, will generate if not provided)');

program.parse();

const options = program.opts();

// Execute swap
const tester = new CrossChainSwapTester();
tester.executeSwap(options as {
  from: string;
  to: string;
  token: string;
  amount: number;
  secret?: string;
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  });