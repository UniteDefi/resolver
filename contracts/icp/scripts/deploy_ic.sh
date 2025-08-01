#!/bin/bash

echo "Starting IC mainnet deployment..."

# Check if user is authenticated
if ! dfx identity whoami &> /dev/null; then
    echo "Please authenticate with dfx identity first"
    exit 1
fi

# Check wallet balance
echo "Checking wallet balance..."
dfx wallet --network ic balance

# Deploy the counter canister
echo "Deploying counter canister to IC mainnet..."
dfx deploy counter --network ic --with-cycles 1000000000000

# Get the canister ID
CANISTER_ID=$(dfx canister id counter --network ic)
echo "Counter canister deployed with ID: $CANISTER_ID"

# Generate TypeScript declarations
echo "Generating TypeScript declarations..."
dfx generate counter

# Export canister ID for tests
echo "export COUNTER_CANISTER_ID=$CANISTER_ID" > .env.ic
echo "export DFX_NETWORK=ic" >> .env.ic

echo "IC mainnet deployment complete!"
echo "Canister URL: https://$CANISTER_ID.ic0.app"