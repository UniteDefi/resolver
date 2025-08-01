#!/bin/bash

echo "Getting ICP wallet information..."

# Check if dfx is installed
if ! command -v dfx &> /dev/null; then
    echo "dfx is not installed. Please install it first:"
    echo "sh -ci \"\$(curl -fsSL https://internetcomputer.org/install.sh)\""
    exit 1
fi

# Use testnet identity
dfx identity use unite-defi-testnet 2>/dev/null || {
    echo "Creating new identity: unite-defi-testnet"
    dfx identity new unite-defi-testnet --storage-mode=plaintext
    dfx identity use unite-defi-testnet
}

# Get the principal ID
PRINCIPAL_ID=$(dfx identity get-principal)
echo ""
echo "Principal ID: $PRINCIPAL_ID"

# Get the account ID (for receiving ICP)
ACCOUNT_ID=$(dfx ledger account-id)
echo "Account ID: $ACCOUNT_ID"

# Export the seed phrase (for backup)
echo ""
echo "IMPORTANT: Save this seed phrase securely!"
echo "==========================================="
dfx identity export unite-defi-testnet
echo "==========================================="

echo ""
echo "To fund your testnet wallet:"
echo "1. Visit: https://faucet.testnet.dfinity.network"
echo "2. Enter your Account ID: $ACCOUNT_ID"
echo "3. Request testnet ICP"
echo ""
echo "Or use the cycles faucet:"
echo "1. Visit: https://internetcomputer.org/docs/current/developer-docs/setup/cycles/cycles-faucet"
echo "2. Use your Principal ID: $PRINCIPAL_ID"