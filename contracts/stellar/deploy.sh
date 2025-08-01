#!/bin/bash

# Stellar Counter Contract Deployment Script

set -e

echo "🚀 Stellar Counter Contract Deployment"
echo "======================================"

# Check if stellar is installed
if ! command -v stellar &> /dev/null; then
    echo "❌ Stellar CLI not found. Please install it first:"
    echo "   cargo install --locked stellar-cli --features opt"
    exit 1
fi

# Parse arguments
NETWORK="${1:-testnet}"
SOURCE_KEY="${STELLAR_SECRET_KEY}"

if [ -z "$SOURCE_KEY" ]; then
    echo "❌ STELLAR_SECRET_KEY not set in environment"
    echo "   Please set it in your .env file or export it"
    exit 1
fi

# Set network parameters
case $NETWORK in
    "local")
        RPC_URL="http://localhost:8000/soroban/rpc"
        NETWORK_PASSPHRASE="Standalone Network ; February 2017"
        ;;
    "testnet")
        RPC_URL="https://soroban-testnet.stellar.org"
        NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
        ;;
    "mainnet")
        RPC_URL="https://soroban.stellar.org"
        NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
        ;;
    *)
        echo "❌ Invalid network: $NETWORK"
        echo "   Use: local, testnet, or mainnet"
        exit 1
        ;;
esac

echo "📦 Building contract..."
cargo build --target wasm32-unknown-unknown --release

WASM_PATH="target/wasm32-unknown-unknown/release/counter.wasm"
WASM_SIZE=$(wc -c < "$WASM_PATH")
echo "✅ Contract built: $WASM_SIZE bytes"

echo "🔧 Optimizing contract..."
if stellar contract optimize --wasm "$WASM_PATH" 2>/dev/null; then
    echo "✅ Contract optimized"
else
    echo "⚠️  Optimization failed, using unoptimized version"
fi

echo "🌐 Deploying to $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
    --wasm "$WASM_PATH" \
    --source "$SOURCE_KEY" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE")

echo "✅ Contract deployed!"
echo "📋 Contract ID: $CONTRACT_ID"

# Save deployment info
DEPLOYMENT_FILE="deployment-$NETWORK.json"
cat > "$DEPLOYMENT_FILE" << EOF
{
  "contractId": "$CONTRACT_ID",
  "network": "$NETWORK",
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "wasmHash": "$(sha256sum "$WASM_PATH" | cut -d' ' -f1)"
}
EOF

echo "💾 Deployment info saved to $DEPLOYMENT_FILE"

echo "🧪 Testing deployment..."
echo -n "   Getting initial count: "
stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$SOURCE_KEY" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    get_count

echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "  - Interact: yarn ts-node scripts/interact.ts --network=$NETWORK --action=demo"
echo "  - Get count: soroban contract invoke --id $CONTRACT_ID ... -- get_count"