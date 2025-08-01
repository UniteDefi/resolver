#!/bin/bash

# Load environment variables
source .env

# Set network
NETWORK=${1:-testnet}

echo "[Deploy] Building contracts with Scarb..."
scarb build

if [ $? -ne 0 ]; then
    echo "[Deploy] Build failed!"
    exit 1
fi

echo "[Deploy] Build successful!"

# Set RPC URL based on network
if [ "$NETWORK" = "mainnet" ]; then
    RPC_URL=$STARKNET_MAINNET_RPC_URL
else
    RPC_URL=$STARKNET_RPC_URL
fi

# Contract paths
CONTRACT_PATH="./target/dev/unite_starknet_Counter.contract_class.json"
SIERRA_PATH="./target/dev/unite_starknet_Counter.sierra.json"

# Check if starkli is installed
if ! command -v starkli &> /dev/null; then
    echo "[Deploy] starkli CLI not found. Please install it first:"
    echo "curl https://get.starkli.sh | sh"
    exit 1
fi

echo "[Deploy] Declaring contract..."
CLASS_HASH=$(starkli declare \
    --rpc $RPC_URL \
    --account $STARKNET_ACCOUNT_ADDRESS \
    --keystore $STARKNET_KEYSTORE_PATH \
    --watch \
    $SIERRA_PATH)

if [ $? -ne 0 ]; then
    echo "[Deploy] Declaration failed!"
    exit 1
fi

echo "[Deploy] Contract declared with class hash: $CLASS_HASH"

# Deploy with initial value 0
echo "[Deploy] Deploying contract instance..."
DEPLOY_OUTPUT=$(starkli deploy \
    --rpc $RPC_URL \
    --account $STARKNET_ACCOUNT_ADDRESS \
    --keystore $STARKNET_KEYSTORE_PATH \
    --watch \
    $CLASS_HASH \
    0)  # Constructor argument: initial_value = 0

if [ $? -ne 0 ]; then
    echo "[Deploy] Deployment failed!"
    exit 1
fi

CONTRACT_ADDRESS=$(echo $DEPLOY_OUTPUT | grep -oE '0x[a-fA-F0-9]+' | tail -1)

echo "[Deploy] ✅ Contract deployed successfully!"
echo "[Deploy] Contract address: $CONTRACT_ADDRESS"
echo "[Deploy] Network: $NETWORK"

# Save deployment info
echo "{
  \"network\": \"$NETWORK\",
  \"contractAddress\": \"$CONTRACT_ADDRESS\",
  \"classHash\": \"$CLASS_HASH\",
  \"timestamp\": \"$(date -u +\"%Y-%m-%dT%H:%M:%SZ\")\"
}" > "./deployments-$NETWORK.json"

echo "[Deploy] Deployment info saved to deployments-$NETWORK.json"