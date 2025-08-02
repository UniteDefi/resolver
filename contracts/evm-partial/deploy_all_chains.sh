#!/bin/bash

# Load environment variables
source .env

# Function to deploy on a specific chain
deploy_chain() {
    local CHAIN_NAME=$1
    local RPC_URL_VAR="${CHAIN_NAME}_RPC_URL"
    local RPC_URL=${!RPC_URL_VAR}
    
    if [ -z "$RPC_URL" ]; then
        echo "❌ RPC URL not found for $CHAIN_NAME (${RPC_URL_VAR})"
        return 1
    fi
    
    echo "🚀 Deploying on $CHAIN_NAME..."
    echo "   RPC URL: $RPC_URL"
    
    # Deploy mock tokens
    echo "   📦 Deploying mock tokens..."
    FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/DeployMocks.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast
    
    if [ $? -ne 0 ]; then
        echo "   ❌ Mock token deployment failed on $CHAIN_NAME"
        return 1
    fi
    
    # Deploy main contracts
    echo "   📦 Deploying main contracts..."
    FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/Deploy.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast
    
    if [ $? -ne 0 ]; then
        echo "   ❌ Main contract deployment failed on $CHAIN_NAME"
        return 1
    fi
    
    # Fund resolvers
    echo "   💰 Funding resolvers..."
    FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/FundResolvers.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast
    
    if [ $? -ne 0 ]; then
        echo "   ❌ Funding failed on $CHAIN_NAME"
        return 1
    fi
    
    echo "   ✅ Deployment complete on $CHAIN_NAME"
    echo ""
    return 0
}

# List of chains to deploy
CHAINS=(
    "ETHERLINK_TESTNET"
    "MONAD_TESTNET"
    "INJECTIVE_TESTNET"
    "AURORA_TESTNET"
    "BNB_TESTNET"
    "OP_SEPOLIA"
    "POLYGON_AMOY"
    "SCROLL_SEPOLIA"
    "CELO_ALFAJORES"
    "UNICHAIN_SEPOLIA"
    "FLOW_TESTNET"
    "SEI_TESTNET"
)

echo "🌐 Starting multi-chain deployment..."
echo "=================================="

# Track successful deployments
SUCCESSFUL=()
FAILED=()

# Deploy on each chain
for CHAIN in "${CHAINS[@]}"; do
    if deploy_chain "$CHAIN"; then
        SUCCESSFUL+=("$CHAIN")
    else
        FAILED+=("$CHAIN")
    fi
done

# Summary
echo ""
echo "=================================="
echo "📊 Deployment Summary"
echo "=================================="
echo "✅ Successful: ${#SUCCESSFUL[@]}"
for chain in "${SUCCESSFUL[@]}"; do
    echo "   - $chain"
done

echo ""
echo "❌ Failed: ${#FAILED[@]}"
for chain in "${FAILED[@]}"; do
    echo "   - $chain"
done