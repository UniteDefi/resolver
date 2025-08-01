#!/bin/bash

echo "Starting testnet deployment..."

# Load testnet environment
if [ -f .env.testnet ]; then
    source .env.testnet
else
    echo "Please run ./scripts/setup_testnet_wallet.sh first"
    exit 1
fi

# Use testnet identity
dfx identity use $DFX_IDENTITY

# Check wallet balance
echo "Checking cycles wallet balance..."
dfx wallet --network testnet balance || {
    echo "No cycles wallet found. Please fund your account first."
    echo "Account ID: $ACCOUNT_ID"
    exit 1
}

# Deploy the counter canister
echo "Deploying counter canister to testnet..."
dfx deploy counter --network testnet --with-cycles 200000000000

# Get the canister ID
CANISTER_ID=$(dfx canister id counter --network testnet)
echo "Counter canister deployed with ID: $CANISTER_ID"

# Update .env.testnet with canister ID
sed -i.bak "s/COUNTER_CANISTER_ID=.*/COUNTER_CANISTER_ID=$CANISTER_ID/" .env.testnet

# Get cycles wallet ID if exists
WALLET_ID=$(dfx identity get-wallet --network testnet 2>/dev/null || echo "")
if [ ! -z "$WALLET_ID" ]; then
    sed -i.bak "s/CYCLES_WALLET_CANISTER_ID=.*/CYCLES_WALLET_CANISTER_ID=$WALLET_ID/" .env.testnet
fi

# Generate TypeScript declarations
echo "Generating TypeScript declarations..."
dfx generate counter

echo ""
echo "Testnet deployment complete!"
echo "Canister ID: $CANISTER_ID"
echo "Canister URL: https://$CANISTER_ID.raw.ic0.app"