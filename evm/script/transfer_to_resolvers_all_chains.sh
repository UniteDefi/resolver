#!/bin/bash

# Transfer native tokens to resolver wallets on all chains

# Load environment variables
source .env

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Starting native token transfers to resolver wallets on all chains..."

# Transfer on Ethereum Sepolia (0.003 ETH per resolver)
echo -e "\n${GREEN}Transferring on Ethereum Sepolia (0.003 ETH per resolver)...${NC}"
forge script script/TransferToResolvers.s.sol:TransferToResolvers --rpc-url $SEPOLIA_RPC_URL --broadcast

# Transfer on Base Sepolia (0.003 ETH per resolver)
echo -e "\n${GREEN}Transferring on Base Sepolia (0.003 ETH per resolver)...${NC}"
forge script script/TransferToResolvers.s.sol:TransferToResolvers --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast

# Transfer on Arbitrum Sepolia (0.003 ETH per resolver)
echo -e "\n${GREEN}Transferring on Arbitrum Sepolia (0.003 ETH per resolver)...${NC}"
forge script script/TransferToResolvers.s.sol:TransferToResolvers --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast

# Transfer on Monad Testnet (0.1 MONAD per resolver)
echo -e "\n${GREEN}Transferring on Monad Testnet (0.1 MONAD per resolver)...${NC}"
forge script script/TransferToResolvers.s.sol:TransferToResolvers --rpc-url $MONAD_TESTNET_RPC_URL --broadcast

echo -e "\n${GREEN}Native token transfers complete!${NC}"
echo -e "${YELLOW}Summary:${NC}"
echo "- Ethereum Sepolia: 0.003 ETH per resolver (0.012 ETH total)"
echo "- Base Sepolia: 0.003 ETH per resolver (0.012 ETH total)"
echo "- Arbitrum Sepolia: 0.003 ETH per resolver (0.012 ETH total)"
echo "- Monad Testnet: 0.1 MONAD per resolver (0.4 MONAD total)"