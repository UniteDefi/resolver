#!/bin/bash

set -e

echo "💰 Starting mainnet wallet funding..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found. Please create one with your configuration."
    exit 1
fi

# Check if deployments file exists
if [ ! -f "deployments_mainnet.json" ]; then
    echo "❌ deployments_mainnet.json not found. Please run DeployMainnet.sh first."
    exit 1
fi

echo "=== FUNDING MAINNET WALLETS ==="
echo "Network: IC Mainnet"
echo "Deployer: $ICP_DEPLOYER_PRINCIPAL"

# Switch to deployer identity
dfx identity use $ICP_DEPLOYER_IDENTITY

# Get deployer wallet balance
DEPLOYER_BALANCE=$(dfx wallet balance --network ic)
echo "Deployer wallet balance: $DEPLOYER_BALANCE"

# Array of all identities to fund
IDENTITIES=("$ICP_USER_IDENTITY" "$ICP_RESOLVER_IDENTITY_0" "$ICP_RESOLVER_IDENTITY_1" "$ICP_RESOLVER_IDENTITY_2" "$ICP_RESOLVER_IDENTITY_3")
PRINCIPALS=("$ICP_USER_PRINCIPAL" "$ICP_RESOLVER_PRINCIPAL_0" "$ICP_RESOLVER_PRINCIPAL_1" "$ICP_RESOLVER_PRINCIPAL_2" "$ICP_RESOLVER_PRINCIPAL_3")
NAMES=("user" "resolver-0" "resolver-1" "resolver-2" "resolver-3")

echo ""
echo "--- Target Wallets ---"
for i in "${!NAMES[@]}"; do
    echo "${NAMES[i]}: ${PRINCIPALS[i]}"
done

# Calculate total cycles needed
TOTAL_WALLETS=${#IDENTITIES[@]}
TOTAL_CYCLES_NEEDED=$((TOTAL_WALLETS * SAFETY_CYCLES_PER_WALLET))

echo ""
echo "--- Funding Requirements ---"
echo "Wallets to fund: $TOTAL_WALLETS"
echo "Cycles per wallet: $SAFETY_CYCLES_PER_WALLET"
echo "Total cycles needed: $TOTAL_CYCLES_NEEDED"

echo ""
echo "--- Creating and Funding Wallets ---"
SUCCESS_COUNT=0

for i in "${!IDENTITIES[@]}"; do
    identity="${IDENTITIES[i]}"
    principal="${PRINCIPALS[i]}"
    name="${NAMES[i]}"
    
    echo "Processing $name ($identity)..."
    
    # Switch to target identity
    dfx identity use $identity
    
    # Check if wallet exists
    if ! dfx identity get-wallet --network ic > /dev/null 2>&1; then
        echo "  Creating cycles wallet for $name..."
        
        # Switch back to deployer to create and fund wallet
        dfx identity use $ICP_DEPLOYER_IDENTITY
        
        # Create wallet for the identity
        WALLET_CANISTER=$(dfx wallet create-canister $principal --network ic --with-cycles $SAFETY_CYCLES_PER_WALLET 2>/dev/null)
        
        if [ -z "$WALLET_CANISTER" ]; then
            echo "  ❌ Failed to create wallet for $name"
            continue
        fi
        
        echo "  Created wallet: $WALLET_CANISTER"
        
        # Install wallet code
        dfx identity use $identity
        dfx identity set-wallet $WALLET_CANISTER --network ic
        
        echo "  ✅ Successfully created and funded $name wallet"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        # Wallet exists, just send more cycles
        EXISTING_WALLET=$(dfx identity get-wallet --network ic)
        echo "  Wallet exists: $EXISTING_WALLET"
        
        # Check current balance
        CURRENT_BALANCE=$(dfx wallet balance --network ic)
        echo "  Current balance: $CURRENT_BALANCE"
        
        # Switch back to deployer to send cycles
        dfx identity use $ICP_DEPLOYER_IDENTITY
        
        echo "  Sending $SAFETY_CYCLES_PER_WALLET cycles..."
        if dfx wallet send $EXISTING_WALLET $SAFETY_CYCLES_PER_WALLET --network ic > /dev/null 2>&1; then
            echo "  ✅ Successfully funded $name wallet"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "  ❌ Failed to send cycles to $name"
        fi
    fi
done

# Switch back to deployer
dfx identity use $ICP_DEPLOYER_IDENTITY

# Final summary
echo ""
echo "✅ WALLET FUNDING COMPLETE"
echo "Successfully funded: $SUCCESS_COUNT/$TOTAL_WALLETS"
echo "Cycles per wallet: $SAFETY_CYCLES_PER_WALLET"
echo "Total cycles distributed: $((SUCCESS_COUNT * SAFETY_CYCLES_PER_WALLET))"

# Check remaining deployer balance
REMAINING_BALANCE=$(dfx wallet balance --network ic)
echo "Remaining deployer balance: $REMAINING_BALANCE"

# Save wallet info for mainnet
cat > wallets_mainnet.json <<EOF
{
  "network": "ic",
  "wallets": {
    "user": {
      "identity": "$ICP_USER_IDENTITY",
      "principal": "$ICP_USER_PRINCIPAL",
      "pemPath": "$ICP_USER_PEM_PATH"
    },
    "resolver0": {
      "identity": "$ICP_RESOLVER_IDENTITY_0",
      "principal": "$ICP_RESOLVER_PRINCIPAL_0",
      "pemPath": "$ICP_RESOLVER_PEM_PATH_0"
    },
    "resolver1": {
      "identity": "$ICP_RESOLVER_IDENTITY_1",
      "principal": "$ICP_RESOLVER_PRINCIPAL_1",
      "pemPath": "$ICP_RESOLVER_PEM_PATH_1"
    },
    "resolver2": {
      "identity": "$ICP_RESOLVER_IDENTITY_2",
      "principal": "$ICP_RESOLVER_PRINCIPAL_2",
      "pemPath": "$ICP_RESOLVER_PEM_PATH_2"
    },
    "resolver3": {
      "identity": "$ICP_RESOLVER_IDENTITY_3",
      "principal": "$ICP_RESOLVER_PRINCIPAL_3",
      "pemPath": "$ICP_RESOLVER_PEM_PATH_3"
    },
    "deployer": {
      "identity": "$ICP_DEPLOYER_IDENTITY",
      "principal": "$ICP_DEPLOYER_PRINCIPAL",
      "pemPath": "$ICP_DEPLOYER_PEM_PATH"
    }
  },
  "funding": {
    "cyclesPerWallet": "$SAFETY_CYCLES_PER_WALLET",
    "totalWalletsFunded": $SUCCESS_COUNT,
    "totalCyclesDistributed": $((SUCCESS_COUNT * SAFETY_CYCLES_PER_WALLET))
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "Wallet info saved to wallets_mainnet.json"