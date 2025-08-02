#!/bin/bash

# Mint tokens to resolver wallets on all chains

# Load environment variables
source .env

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Starting token minting to resolver wallets on all chains..."

# Mint on Sepolia
echo -e "\n${GREEN}Minting on Sepolia...${NC}"
forge script script/MintTokensToResolvers.s.sol:MintTokensToResolvers --rpc-url $SEPOLIA_RPC_URL --broadcast

# Mint on Base Sepolia  
echo -e "\n${GREEN}Minting on Base Sepolia...${NC}"
forge script script/MintTokensToResolvers.s.sol:MintTokensToResolvers --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast

# Mint on Arbitrum Sepolia
echo -e "\n${GREEN}Minting on Arbitrum Sepolia...${NC}"
forge script script/MintTokensToResolvers.s.sol:MintTokensToResolvers --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast

# Mint on Monad Testnet
echo -e "\n${GREEN}Minting on Monad Testnet...${NC}"
forge script script/MintTokensToResolvers.s.sol:MintTokensToResolvers --rpc-url $MONAD_TESTNET_RPC_URL --broadcast

echo -e "\n${GREEN}Token minting complete!${NC}"
echo "Note: You still need to fund resolver wallets with native gas tokens manually"