#!/usr/bin/env ts-node

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import Table from 'cli-table3';

// Load environment variables
dotenv.config({ path: '../.env' });

// Load deployments
import deployments from '../deployments.json';

// Chain configurations
const CHAIN_CONFIGS = {
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

// ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function checkBalances(walletAddress?: string) {
  // Use provided address or get from environment
  const address = walletAddress || process.env.USER_WALLET_ADDRESS;
  
  if (!address) {
    throw new Error('No wallet address provided and USER_WALLET_ADDRESS not found in environment');
  }

  console.log(chalk.blue(`\nChecking balances for: ${address}\n`));

  // Create table for displaying balances
  const table = new Table({
    head: [
      chalk.cyan('Chain'),
      chalk.cyan('Native'),
      chalk.cyan('USDT'),
      chalk.cyan('DAI'),
      chalk.cyan('Wrapped Native')
    ],
    colWidths: [20, 15, 15, 15, 15]
  });

  for (const [chainKey, chainConfig] of Object.entries(CHAIN_CONFIGS)) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
      
      // Get native balance
      const nativeBalance = await provider.getBalance(address);
      const nativeFormatted = ethers.utils.formatEther(nativeBalance);
      
      // Get token balances
      const usdtContract = new ethers.Contract(
        chainConfig.deployments.MockERC20,
        ERC20_ABI,
        provider
      );
      const daiContract = new ethers.Contract(
        chainConfig.deployments.MockERC20_2,
        ERC20_ABI,
        provider
      );
      const wrappedContract = new ethers.Contract(
        chainConfig.deployments.MockWrappedNative,
        ERC20_ABI,
        provider
      );

      const [usdtBalance, daiBalance, wrappedBalance] = await Promise.all([
        usdtContract.balanceOf(address),
        daiContract.balanceOf(address),
        wrappedContract.balanceOf(address)
      ]);

      // Format balances
      const usdtFormatted = ethers.utils.formatUnits(usdtBalance, 6);
      const daiFormatted = ethers.utils.formatUnits(daiBalance, 18);
      const wrappedFormatted = ethers.utils.formatUnits(wrappedBalance, 18);

      // Add row to table
      table.push([
        chainConfig.name,
        parseFloat(nativeFormatted).toFixed(4),
        parseFloat(usdtFormatted).toFixed(2),
        parseFloat(daiFormatted).toFixed(2),
        parseFloat(wrappedFormatted).toFixed(4)
      ]);

    } catch (error) {
      table.push([
        chainConfig.name,
        chalk.red('Error'),
        chalk.red('Error'),
        chalk.red('Error'),
        chalk.red('Error')
      ]);
    }
  }

  console.log(table.toString());
  console.log('');
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const walletAddress = args[0];
  
  checkBalances(walletAddress)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    });
}

export { checkBalances };