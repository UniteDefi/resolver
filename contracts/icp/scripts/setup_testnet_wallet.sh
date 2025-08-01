#!/bin/bash

echo "Setting up ICP testnet wallet..."

# Create a new identity for testnet
IDENTITY_NAME="unite-defi-testnet"
echo "Creating new identity: $IDENTITY_NAME"
dfx identity new $IDENTITY_NAME --storage-mode=plaintext || echo "Identity already exists"

# Use the identity
dfx identity use $IDENTITY_NAME

# Get the principal ID
PRINCIPAL_ID=$(dfx identity get-principal)
echo "Principal ID: $PRINCIPAL_ID"

# Get the account ID (for receiving ICP)
ACCOUNT_ID=$(dfx ledger account-id)
echo "Account ID: $ACCOUNT_ID"

# Create a cycles wallet on testnet
echo "Creating cycles wallet on testnet..."
dfx wallet --network testnet balance 2>/dev/null || {
    echo "No wallet found. After funding, run:"
    echo "dfx wallet --network testnet create-canister <principal-id> --amount <cycles>"
}

# Save configuration to .env.testnet
cat > .env.testnet << EOF
# Testnet configuration
DFX_NETWORK=testnet
DFX_HOST=https://testnet.dfinity.network
DFX_IDENTITY=$IDENTITY_NAME

# Principal and Account IDs
PRINCIPAL_ID=$PRINCIPAL_ID
ACCOUNT_ID=$ACCOUNT_ID

# Canister IDs (will be populated after deployment)
COUNTER_CANISTER_ID=

# Cycles wallet (will be populated after funding)
CYCLES_WALLET_CANISTER_ID=
EOF

echo ""
echo "============================================"
echo "Testnet wallet setup complete!"
echo "============================================"
echo ""
echo "Fund this account with testnet ICP:"
echo "Account ID: $ACCOUNT_ID"
echo ""
echo "Or fund this principal directly with cycles:"
echo "Principal ID: $PRINCIPAL_ID"
echo ""
echo "Configuration saved to .env.testnet"
echo "============================================"