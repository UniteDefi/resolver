#!/bin/bash

# Contract deployment using forge
PRIVATE_KEY="0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3"
CONTRACT_PATH="contracts/src/SimpleDutchAuction.sol:SimpleDutchAuction"

echo "Deploying SimpleDutchAuction to all testnets..."
echo "Deployer: $(cast wallet address $PRIVATE_KEY)"
echo ""

# Create deployments file
echo "{" > deployments.json
echo '  "deployments": [' >> deployments.json

# Deploy to Ethereum Sepolia
echo "Deploying to Ethereum Sepolia..."
ETH_DEPLOY=$(forge create $CONTRACT_PATH \
  --private-key $PRIVATE_KEY \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --json 2>/dev/null | jq -r '.deployedTo // empty')

if [ -n "$ETH_DEPLOY" ]; then
  echo "✅ Ethereum Sepolia: $ETH_DEPLOY"
  echo '    {"network": "Ethereum Sepolia", "chainId": 11155111, "address": "'$ETH_DEPLOY'"},' >> deployments.json
else
  echo "❌ Failed to deploy to Ethereum Sepolia"
fi

# Deploy to Base Sepolia
echo "Deploying to Base Sepolia..."
BASE_DEPLOY=$(forge create $CONTRACT_PATH \
  --private-key $PRIVATE_KEY \
  --rpc-url https://sepolia.base.org \
  --json 2>/dev/null | jq -r '.deployedTo // empty')

if [ -n "$BASE_DEPLOY" ]; then
  echo "✅ Base Sepolia: $BASE_DEPLOY"
  echo '    {"network": "Base Sepolia", "chainId": 84532, "address": "'$BASE_DEPLOY'"},' >> deployments.json
else
  echo "❌ Failed to deploy to Base Sepolia"
fi

# Deploy to Polygon Amoy
echo "Deploying to Polygon Amoy..."
POLYGON_DEPLOY=$(forge create $CONTRACT_PATH \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc-amoy.polygon.technology \
  --legacy \
  --json 2>/dev/null | jq -r '.deployedTo // empty')

if [ -n "$POLYGON_DEPLOY" ]; then
  echo "✅ Polygon Amoy: $POLYGON_DEPLOY"
  echo '    {"network": "Polygon Amoy", "chainId": 80002, "address": "'$POLYGON_DEPLOY'"},' >> deployments.json
else
  echo "❌ Failed to deploy to Polygon Amoy"
fi

# Deploy to Arbitrum Sepolia
echo "Deploying to Arbitrum Sepolia..."
ARB_DEPLOY=$(forge create $CONTRACT_PATH \
  --private-key $PRIVATE_KEY \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --json 2>/dev/null | jq -r '.deployedTo // empty')

if [ -n "$ARB_DEPLOY" ]; then
  echo "✅ Arbitrum Sepolia: $ARB_DEPLOY"
  echo '    {"network": "Arbitrum Sepolia", "chainId": 421614, "address": "'$ARB_DEPLOY'"}' >> deployments.json
else
  echo "❌ Failed to deploy to Arbitrum Sepolia"
fi

# Close JSON
echo '  ]' >> deployments.json
echo '}' >> deployments.json

echo ""
echo "Deployment complete! Check deployments.json for addresses."