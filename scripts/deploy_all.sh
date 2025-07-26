#!/bin/bash

# Load environment variables
source .env.deployment

echo "Deploying SimpleDutchAuction to all testnets..."
echo "Using deployer address: $(cast wallet address $PRIVATE_KEY)"
echo ""

# Deploy to Ethereum Sepolia
echo "Deploying to Ethereum Sepolia..."
PRIVATE_KEY=$PRIVATE_KEY forge script contracts/script/DeployDutchAuction.s.sol:DeployDutchAuction \
  --rpc-url $ETH_SEPOLIA_RPC_PUBLIC \
  --broadcast \
  --verify \
  --etherscan-api-key PLACEHOLDER \
  -vvvv

# Deploy to Polygon Amoy
echo "Deploying to Polygon Amoy..."
PRIVATE_KEY=$PRIVATE_KEY forge script contracts/script/DeployDutchAuction.s.sol:DeployDutchAuction \
  --rpc-url $POLYGON_AMOY_RPC_PUBLIC \
  --broadcast \
  --legacy \
  -vvvv

# Deploy to Base Sepolia
echo "Deploying to Base Sepolia..."
PRIVATE_KEY=$PRIVATE_KEY forge script contracts/script/DeployDutchAuction.s.sol:DeployDutchAuction \
  --rpc-url $BASE_SEPOLIA_RPC_PUBLIC \
  --broadcast \
  -vvvv

# Deploy to Arbitrum Sepolia
echo "Deploying to Arbitrum Sepolia..."
PRIVATE_KEY=$PRIVATE_KEY forge script contracts/script/DeployDutchAuction.s.sol:DeployDutchAuction \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_PUBLIC \
  --broadcast \
  -vvvv

echo ""
echo "Deployment complete! Check the logs above for contract addresses."