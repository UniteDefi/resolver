#!/bin/bash

echo "🚀 Unite Protocol Quick Deployment Script"
echo "========================================"

# Check if aptos CLI is installed
if ! command -v aptos &> /dev/null; then
    echo "❌ Aptos CLI not found. Please install it first."
    exit 1
fi

# Generate new account
echo "📝 Generating new deployer account..."
aptos key generate --key-type ed25519 --output-file deployer.key
NEW_ACCOUNT=$(aptos address derive --key-file deployer.key | grep -oE '0x[a-fA-F0-9]{64}')
PRIVATE_KEY=$(cat deployer.key | jq -r '.private_key' | sed 's/0x//')

if [ -z "$NEW_ACCOUNT" ]; then
    echo "❌ Failed to generate account"
    exit 1
fi

echo "✅ New account created: $NEW_ACCOUNT"
echo "🔑 Private key: $PRIVATE_KEY"

# Save credentials
echo "APTOS_DEPLOYER_ADDRESS=$NEW_ACCOUNT" > .env.new
echo "APTOS_PRIVATE_KEY=$PRIVATE_KEY" >> .env.new
echo "APTOS_NETWORK=testnet" >> .env.new

# Update Move.toml
echo "📝 Updating Move.toml..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/aptos_addr = .*/aptos_addr = \"$NEW_ACCOUNT\"/" Move.toml
else
    # Linux
    sed -i "s/aptos_addr = .*/aptos_addr = \"$NEW_ACCOUNT\"/" Move.toml
fi

echo ""
echo "⚠️  IMPORTANT: Fund your account before continuing!"
echo "=================================================="
echo "1. Visit: https://aptos.dev/en/network/faucet"
echo "2. Enter address: $NEW_ACCOUNT"
echo "3. Request testnet APT (at least 2 APT recommended)"
echo ""
echo "Press ENTER when you've funded the account..."
read

# Verify funding
echo "🔍 Checking account balance..."
BALANCE=$(aptos account list --account $NEW_ACCOUNT --query resources 2>&1 | grep -A 2 "coin::CoinStore<0x1::aptos_coin::AptosCoin>" | grep "value" | grep -oE '[0-9]+' || echo "0")

if [ "$BALANCE" -eq "0" ]; then
    echo "❌ Account has no balance. Please fund it first."
    exit 1
fi

echo "✅ Account balance: $BALANCE"

# Compile
echo ""
echo "🔨 Compiling Move modules..."
aptos move compile --save-metadata

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed"
    exit 1
fi

# Deploy
echo ""
echo "📦 Deploying contracts..."
aptos move publish \
    --named-addresses aptos_addr=$NEW_ACCOUNT \
    --private-key $PRIVATE_KEY \
    --assume-yes

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "✅ Deployment successful!"
echo ""
echo "📋 Deployment Summary"
echo "===================="
echo "Package Address: $NEW_ACCOUNT"
echo "Network: Testnet"
echo ""
echo "🪙 Token Types:"
echo "- SimpleFaucetUSDT: ${NEW_ACCOUNT}::simple_faucet::SimpleFaucetUSDT"
echo "- SimpleFaucetDAI: ${NEW_ACCOUNT}::simple_faucet::SimpleFaucetDAI"
echo ""
echo "📝 Next Steps:"
echo "1. Run: npx ts-node scripts/initialize_faucet.ts"
echo "2. Update .env with values from .env.new"
echo "3. Mint tokens and test cross-chain swaps"
echo ""
echo "✅ Done!"