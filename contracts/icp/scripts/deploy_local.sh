#!/bin/bash

echo "Starting local ICP deployment..."

# Start dfx in the background if not already running
if ! dfx ping &> /dev/null; then
    echo "Starting dfx..."
    dfx start --clean --background
    sleep 5
fi

# Deploy the counter canister
echo "Deploying counter canister..."
dfx deploy counter --network local

# Get the canister ID
CANISTER_ID=$(dfx canister id counter --network local)
echo "Counter canister deployed with ID: $CANISTER_ID"

# Generate TypeScript declarations
echo "Generating TypeScript declarations..."
dfx generate counter

# Export canister ID for tests
echo "export COUNTER_CANISTER_ID=$CANISTER_ID" > .env.local

echo "Local deployment complete!"
echo "You can now run tests with: npm test"