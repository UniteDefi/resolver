#!/bin/bash

# Authorize relayer wallets on all chains

# Load environment variables
source .env

# Check if RELAYER_WALLET_ADDRESS is set
if [ -z "$RELAYER_WALLET_ADDRESS" ]; then
    echo "Error: RELAYER_WALLET_ADDRESS not set in .env"
    exit 1
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Authorizing relayer wallet: $RELAYER_WALLET_ADDRESS"

# Authorize on Sepolia
echo -e "\n${GREEN}Authorizing on Sepolia...${NC}"
forge script script/AuthorizeRelayers.s.sol:AuthorizeRelayers --rpc-url $SEPOLIA_RPC_URL --broadcast

# Authorize on Base Sepolia  
echo -e "\n${GREEN}Authorizing on Base Sepolia...${NC}"
forge script script/AuthorizeRelayers.s.sol:AuthorizeRelayers --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast

# Authorize on Arbitrum Sepolia
echo -e "\n${GREEN}Authorizing on Arbitrum Sepolia...${NC}"
forge script script/AuthorizeRelayers.s.sol:AuthorizeRelayers --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast

# Authorize on Monad Testnet
echo -e "\n${GREEN}Authorizing on Monad Testnet...${NC}"
forge script script/AuthorizeRelayers.s.sol:AuthorizeRelayers --rpc-url $MONAD_TESTNET_RPC_URL --broadcast

echo -e "\n${GREEN}Relayer authorization complete!${NC}"