#!/bin/bash

echo "=== Deploying Contracts to Near Testnet ==="
echo ""

# Account details
ACCOUNT_ID="unite-defi-test-1753622960.testnet"
RELAYER_ACCOUNT="relayer.$ACCOUNT_ID"
ESCROW_ACCOUNT="escrow.$ACCOUNT_ID"

echo "Main account: $ACCOUNT_ID"
echo ""

# Check balance
echo "Checking account balance..."
near state $ACCOUNT_ID

echo ""
echo "Creating subaccounts..."

# Create relayer subaccount
echo "Creating $RELAYER_ACCOUNT..."
near create-account $RELAYER_ACCOUNT --masterAccount $ACCOUNT_ID --initialBalance 3 || echo "Account may already exist"

# Create escrow subaccount
echo "Creating $ESCROW_ACCOUNT..."
near create-account $ESCROW_ACCOUNT --masterAccount $ACCOUNT_ID --initialBalance 3 || echo "Account may already exist"

echo ""
echo "Deploying contracts..."

# Deploy relayer contract
echo "Deploying relayer contract to $RELAYER_ACCOUNT..."
near deploy $RELAYER_ACCOUNT target/wasm32-unknown-unknown/release/simple_relayer.wasm

# Deploy escrow contract
echo "Deploying escrow contract to $ESCROW_ACCOUNT..."
near deploy $ESCROW_ACCOUNT target/wasm32-unknown-unknown/release/simple_escrow.wasm

echo ""
echo "Initializing contracts..."

# Initialize relayer
echo "Initializing relayer contract..."
near call $RELAYER_ACCOUNT new '{}' --accountId $ACCOUNT_ID

# Initialize escrow
echo "Initializing escrow contract..."
near call $ESCROW_ACCOUNT new '{}' --accountId $ACCOUNT_ID

echo ""
echo "=== Deployment Complete ==="
echo "Relayer contract: $RELAYER_ACCOUNT"
echo "Escrow contract: $ESCROW_ACCOUNT"