#!/bin/bash

# Deploy script for all chains

# Load environment variables
source .env

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Starting deployment on all chains..."

# # Deploy on Sepolia
# echo -e "\n${GREEN}Deploying on Sepolia...${NC}"
# forge script contracts/script/DeployAll.s.sol:DeployAll --rpc-url $SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY 

# # Deploy on Base Sepolia  
# echo -e "\n${GREEN}Deploying on Base Sepolia...${NC}"
# forge script contracts/script/DeployAll.s.sol:DeployAll --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY

# # Deploy on Arbitrum Sepolia
# echo -e "\n${GREEN}Deploying on Arbitrum Sepolia...${NC}"
# forge script contracts/script/DeployAll.s.sol:DeployAll --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY

# Deploy on Monad Testnet
echo -e "\n${GREEN}Deploying on Monad Testnet...${NC}"
forge script contracts/script/DeployAll.s.sol:DeployAll --rpc-url $MONAD_TESTNET_RPC_URL --broadcast --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org

echo -e "\n${GREEN}Deployment complete!${NC}"
echo "Next step: Run authorize_relayers.sh to authorize relayer wallets on all chains"