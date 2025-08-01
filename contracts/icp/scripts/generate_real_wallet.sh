#!/bin/bash

echo "Generating real ICP wallet credentials..."

# Check if dfx is installed
if ! command -v dfx &> /dev/null; then
    echo "ERROR: dfx is not installed."
    echo ""
    echo "Please install dfx manually:"
    echo "1. Visit: https://internetcomputer.org/docs/current/developer-docs/setup/install"
    echo "2. Or run: sh -ci \"\$(curl -fsSL https://internetcomputer.org/install.sh)\""
    exit 1
fi

# Create new identity
IDENTITY_NAME="unite-defi-testnet"
echo "Creating identity: $IDENTITY_NAME"
dfx identity new $IDENTITY_NAME --storage-mode=plaintext 2>/dev/null || echo "Using existing identity"
dfx identity use $IDENTITY_NAME

# Get credentials
PRINCIPAL_ID=$(dfx identity get-principal)
ACCOUNT_ID=$(dfx ledger account-id)

# Export seed phrase to temp file
TEMP_SEED=$(mktemp)
dfx identity export $IDENTITY_NAME > $TEMP_SEED 2>&1
SEED_PHRASE=$(cat $TEMP_SEED | grep -A20 "BEGIN EC PRIVATE KEY" || echo "Could not extract seed")
rm -f $TEMP_SEED

# Update .env file
cat > .env << EOF
# ICP Testnet Configuration
DFX_NETWORK=testnet
DFX_HOST=https://testnet.dfinity.network
DFX_IDENTITY=$IDENTITY_NAME

# Generated Wallet Information
# Principal ID (use this for canister interactions)
PRINCIPAL_ID=$PRINCIPAL_ID

# Account ID (use this for receiving ICP from faucet)
ACCOUNT_ID=$ACCOUNT_ID

# Private Key (KEEP THIS SECRET!)
# Exported from dfx identity
PRIVATE_KEY_PEM="$SEED_PHRASE"

# Canister IDs (will be populated after deployment)
COUNTER_CANISTER_ID=

# Cycles wallet (will be populated after funding)
CYCLES_WALLET_CANISTER_ID=

# Test Configuration
NODE_ENV=test
LOG_LEVEL=debug
EOF

echo ""
echo "============================================"
echo "Wallet Generated Successfully!"
echo "============================================"
echo ""
echo "IMPORTANT: Your wallet credentials have been saved to .env"
echo ""
echo "To fund your testnet wallet:"
echo "1. Visit: https://faucet.testnet.dfinity.network"
echo "2. Enter this Account ID: $ACCOUNT_ID"
echo "3. Request testnet ICP (usually 10 ICP)"
echo ""
echo "Your Principal ID: $PRINCIPAL_ID"
echo "============================================"
echo ""
echo "SECURITY WARNING: The .env file contains your private key."
echo "Never commit this file to version control!"
echo "============================================"