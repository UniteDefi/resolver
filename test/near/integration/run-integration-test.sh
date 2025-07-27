#!/bin/bash

echo "=== Cross-Chain HTLC Integration Test ==="
echo ""

# Check for required environment variables
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Please copy .env.example and configure it."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Verify required variables
required_vars=("NEAR_ACCOUNT_ID" "NEAR_PRIVATE_KEY" "BASE_PRIVATE_KEY")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: $var is not set in .env"
        exit 1
    fi
done

echo "✅ Environment configured"
echo ""

# Build Near contracts
echo "📦 Building Near contracts..."
cd ..
./build.sh
cd integration

echo ""
echo "🔧 Compiling Base contracts..."
yarn compile-contracts

echo ""
echo "🚀 Deploying contracts..."
echo "   This will deploy to Near testnet and Base Sepolia"
echo "   Make sure you have sufficient funds in both accounts"
echo ""

# Deploy contracts
yarn deploy-all

echo ""
echo "🧪 Running integration tests..."
yarn test

echo ""
echo "✅ Integration test complete!"