#!/usr/bin/env ts-node

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { Command } from 'commander';

// Load environment variables
dotenv.config({ path: '../.env' });

// Load deployments
const deployments = require('../deployments.json');

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

// MockERC20 ABI (with mint function)
const MOCK_ERC20_ABI = [
  'function mint(address to, uint256 amount)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function fundUser(options: {
  chain: string;
  usdt?: number;
  dai?: number;
  wrapped?: number;
  wallet?: string;
}) {
  const chainConfig = CHAIN_CONFIGS[options.chain];
  if (!chainConfig) {
    throw new Error(`Invalid chain: ${options.chain}`);
  }

  const deployerPrivateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerPrivateKey) {
    throw new Error('PRIVATE_KEY or DEPLOYER_PRIVATE_KEY not found in environment');
  }

  const rawUserAddress = options.wallet || process.env.USER_WALLET_ADDRESS;
  if (!rawUserAddress) {
    throw new Error('No wallet address provided and USER_WALLET_ADDRESS not found in environment');
  }
  
  // Handle checksum issues by converting to lowercase first
  const userAddress = ethers.utils.getAddress(rawUserAddress.toLowerCase());

  console.log(chalk.blue(`\nFunding user wallet on ${chainConfig.name}\n`));
  console.log(`User wallet: ${userAddress}`);

  const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
  const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider);

  console.log(`Deployer: ${deployerWallet.address}`);
  console.log('');

  // Mint USDT if requested
  if (options.usdt && options.usdt > 0) {
    console.log(chalk.yellow(`Minting ${options.usdt} USDT...`));
    const usdtContract = new ethers.Contract(
      ethers.utils.getAddress(chainConfig.deployments.MockERC20),
      MOCK_ERC20_ABI,
      deployerWallet
    );
    
    const usdtAmount = ethers.utils.parseUnits(options.usdt.toString(), 6);
    const tx = await usdtContract.mint(userAddress, usdtAmount);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log(chalk.green('  ✓ Minted successfully'));
  }

  // Mint DAI if requested
  if (options.dai && options.dai > 0) {
    console.log(chalk.yellow(`Minting ${options.dai} DAI...`));
    const daiContract = new ethers.Contract(
      ethers.utils.getAddress(chainConfig.deployments.MockERC20_2),
      MOCK_ERC20_ABI,
      deployerWallet
    );
    
    const daiAmount = ethers.utils.parseUnits(options.dai.toString(), 18);
    const tx = await daiContract.mint(userAddress, daiAmount);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log(chalk.green('  ✓ Minted successfully'));
  }

  // Mint Wrapped Native if requested
  if (options.wrapped && options.wrapped > 0) {
    console.log(chalk.yellow(`Minting ${options.wrapped} Wrapped Native...`));
    try {
      const wrappedContract = new ethers.Contract(
        ethers.utils.getAddress(chainConfig.deployments.MockWrappedNative),
        MOCK_ERC20_ABI,
        deployerWallet
      );
      
      const wrappedAmount = ethers.utils.parseUnits(options.wrapped.toString(), 18);
      const tx = await wrappedContract.mint(userAddress, wrappedAmount);
      console.log(`  Tx: ${tx.hash}`);
      await tx.wait();
      console.log(chalk.green('  ✓ Minted successfully'));
    } catch (error: any) {
      console.log(chalk.red('  ✗ Failed to mint Wrapped Native:'), error.message);
      console.log(chalk.yellow('  Note: MockWrappedNative might have different minting restrictions'));
    }
  }

  console.log(chalk.green('\n✓ Funding complete!'));
}

// CLI setup
const program = new Command();

program
  .name('fund-user')
  .description('Fund user wallet with test tokens')
  .requiredOption('--chain <chain>', 'Chain to fund on (eth_sepolia, base_sepolia, arb_sepolia, monad_testnet)')
  .option('--usdt <amount>', 'Amount of USDT to mint', parseFloat, 1000)
  .option('--dai <amount>', 'Amount of DAI to mint', parseFloat, 1000)
  .option('--wrapped <amount>', 'Amount of Wrapped Native to mint', parseFloat, 10)
  .option('--wallet <address>', 'Wallet address to fund (defaults to USER_WALLET_ADDRESS)');

program.parse();

const options = program.opts();

// Execute funding
fundUser(options as {
  chain: string;
  usdt?: number;
  dai?: number;
  wrapped?: number;
  wallet?: string;
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  });