#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Unite DeFi Contract Commands ===${NC}"

case "$1" in
    "compile")
        echo -e "${YELLOW}Compiling contracts...${NC}"
        forge build
        ;;
        
    "mint")
        echo -e "${YELLOW}Minting tokens to user and resolver wallets...${NC}"
        echo -e "${YELLOW}Make sure you have set the following environment variables:${NC}"
        echo "- DEPLOYER_PRIVATE_KEY"
        echo "- USER_WALLET_1"
        echo "- USER_WALLET_2"
        echo "- RESOLVER_WALLET_1"
        echo "- RESOLVER_WALLET_2"
        echo "- RESOLVER_WALLET_3"
        echo ""
        
        if [ -z "$2" ]; then
            echo -e "${RED}Please specify the chain to mint on:${NC}"
            echo "Usage: ./run-commands.sh mint <chain>"
            echo "Available chains: base-sepolia, arbitrum-sepolia, ethereum-sepolia"
            exit 1
        fi
        
        case "$2" in
            "base-sepolia")
                forge script script/MintTokens.s.sol:MintTokens --rpc-url base_sepolia --broadcast
                ;;
            "arbitrum-sepolia")
                forge script script/MintTokens.s.sol:MintTokens --rpc-url https://sepolia-rollup.arbitrum.io/rpc --broadcast
                ;;
            "ethereum-sepolia")
                forge script script/MintTokens.s.sol:MintTokens --rpc-url https://rpc.sepolia.org --broadcast
                ;;
            *)
                echo -e "${RED}Unknown chain: $2${NC}"
                exit 1
                ;;
        esac
        ;;
        
    "test")
        echo -e "${YELLOW}Testing full cross-chain flow...${NC}"
        echo -e "${YELLOW}Checking wallet balances first...${NC}"
        
        if [ -z "$2" ]; then
            echo -e "${RED}Please specify the chain to test on:${NC}"
            echo "Usage: ./run-commands.sh test <chain>"
            echo "Available chains: base-sepolia, arbitrum-sepolia"
            exit 1
        fi
        
        case "$2" in
            "base-sepolia")
                forge script script/TestFullFlow.s.sol:TestFullFlow --rpc-url base_sepolia --broadcast
                ;;
            "arbitrum-sepolia")
                forge script script/TestFullFlow.s.sol:TestFullFlow --rpc-url https://sepolia-rollup.arbitrum.io/rpc --broadcast
                ;;
            *)
                echo -e "${RED}Unknown chain: $2${NC}"
                exit 1
                ;;
        esac
        ;;
        
    *)
        echo -e "${RED}Invalid command!${NC}"
        echo "Usage:"
        echo "  ./run-commands.sh compile              - Compile all contracts"
        echo "  ./run-commands.sh mint <chain>         - Mint tokens to wallets"
        echo "  ./run-commands.sh test <chain>         - Test full cross-chain flow"
        echo ""
        echo "Available chains: base-sepolia, arbitrum-sepolia, ethereum-sepolia"
        echo ""
        echo "Required environment variables:"
        echo "  DEPLOYER_PRIVATE_KEY - Private key of token deployer/owner"
        echo "  USER_WALLET_1        - User wallet address"
        echo "  USER_WALLET_2        - User wallet address (optional)"
        echo "  USER_PRIVATE_KEY_1   - User private key for testing"
        echo "  RESOLVER_WALLET_1    - Resolver wallet address"
        echo "  RESOLVER_WALLET_2    - Resolver wallet address"
        echo "  RESOLVER_WALLET_3    - Resolver wallet address"
        exit 1
        ;;
esac