#!/bin/bash

set -e

echo "💰 Starting wallet funding..."

# Check if deployments file exists
if [ ! -f "deployments.json" ]; then
    echo "❌ deployments.json not found. Please run DeployAll.sh first."
    exit 1
fi

# Get environment variables or set defaults
FUND_TARGETS="${FUND_TARGETS:-all}"
FUND_AMOUNT="${FUND_AMOUNT:-10000000000000}"  # 10 trillion cycles

echo "=== FUNDING WALLETS ==="
echo "Chain: ICP Local"
echo "Targets: $FUND_TARGETS"
echo "Amount per wallet: $FUND_AMOUNT cycles"

# Create test identities if they don't exist
echo "Creating test identities..."

# User identity
if ! dfx identity list | grep -q "unite-user"; then
    dfx identity new unite-user --storage-mode plaintext
fi

# Resolver identities
for i in {0..3}; do
    if ! dfx identity list | grep -q "unite-resolver$i"; then
        dfx identity new unite-resolver$i --storage-mode plaintext
    fi
done

# Get principals
USER_PRINCIPAL=$(dfx identity use unite-user && dfx identity get-principal)
RESOLVER0_PRINCIPAL=$(dfx identity use unite-resolver0 && dfx identity get-principal)
RESOLVER1_PRINCIPAL=$(dfx identity use unite-resolver1 && dfx identity get-principal)
RESOLVER2_PRINCIPAL=$(dfx identity use unite-resolver2 && dfx identity get-principal)
RESOLVER3_PRINCIPAL=$(dfx identity use unite-resolver3 && dfx identity get-principal)
DEPLOYER_PRINCIPAL=$(dfx identity use default && dfx identity get-principal)

echo ""
echo "--- Wallet Principals ---"
echo "User: $USER_PRINCIPAL"
echo "Resolver0: $RESOLVER0_PRINCIPAL"
echo "Resolver1: $RESOLVER1_PRINCIPAL"
echo "Resolver2: $RESOLVER2_PRINCIPAL"
echo "Resolver3: $RESOLVER3_PRINCIPAL"
echo "Deployer: $DEPLOYER_PRINCIPAL"

# Switch back to default identity for funding
dfx identity use default

# Get default wallet
DEFAULT_WALLET=$(dfx identity get-wallet --network local)
DEPLOYER_BALANCE=$(dfx wallet balance --network local)

echo ""
echo "--- Deployer Wallet Info ---"
echo "Wallet: $DEFAULT_WALLET"
echo "Balance: $DEPLOYER_BALANCE"

# Parse targets and create wallets
declare -a TARGETS_TO_FUND=()
declare -a PRINCIPALS_TO_FUND=()

if [ "$FUND_TARGETS" = "all" ]; then
    TARGETS_TO_FUND=("user" "resolver0" "resolver1" "resolver2" "resolver3")
    PRINCIPALS_TO_FUND=("$USER_PRINCIPAL" "$RESOLVER0_PRINCIPAL" "$RESOLVER1_PRINCIPAL" "$RESOLVER2_PRINCIPAL" "$RESOLVER3_PRINCIPAL")
else
    IFS=',' read -ra TARGET_ARRAY <<< "$FUND_TARGETS"
    for target in "${TARGET_ARRAY[@]}"; do
        case $target in
            "user")
                TARGETS_TO_FUND+=("user")
                PRINCIPALS_TO_FUND+=("$USER_PRINCIPAL")
                ;;
            "resolver0")
                TARGETS_TO_FUND+=("resolver0")
                PRINCIPALS_TO_FUND+=("$RESOLVER0_PRINCIPAL")
                ;;
            "resolver1")
                TARGETS_TO_FUND+=("resolver1")
                PRINCIPALS_TO_FUND+=("$RESOLVER1_PRINCIPAL")
                ;;
            "resolver2")
                TARGETS_TO_FUND+=("resolver2")
                PRINCIPALS_TO_FUND+=("$RESOLVER2_PRINCIPAL")
                ;;
            "resolver3")
                TARGETS_TO_FUND+=("resolver3")
                PRINCIPALS_TO_FUND+=("$RESOLVER3_PRINCIPAL")
                ;;
            *)
                echo "Warning: Unknown target '$target'. Valid targets: user, resolver0, resolver1, resolver2, resolver3, all"
                ;;
        esac
    done
fi

if [ ${#TARGETS_TO_FUND[@]} -eq 0 ]; then
    echo "❌ No valid targets specified"
    echo "Valid targets: user, resolver0, resolver1, resolver2, resolver3, all"
    exit 1
fi

# Calculate total required cycles
TOTAL_REQUIRED=$((${#TARGETS_TO_FUND[@]} * FUND_AMOUNT))
echo ""
echo "--- Funding Requirements ---"
echo "Targets to fund: ${#TARGETS_TO_FUND[@]}"
echo "Amount per target: $FUND_AMOUNT cycles"
echo "Total required: $TOTAL_REQUIRED cycles"

# Create wallets and fund them
echo ""
echo "--- Creating and Funding Wallets ---"
SUCCESS_COUNT=0

for i in "${!TARGETS_TO_FUND[@]}"; do
    target="${TARGETS_TO_FUND[i]}"
    principal="${PRINCIPALS_TO_FUND[i]}"
    
    echo "Processing $target ($principal)..."
    
    # Switch to target identity
    dfx identity use unite-$target > /dev/null 2>&1
    
    # Check if wallet exists
    if ! dfx identity get-wallet --network local > /dev/null 2>&1; then
        echo "  Creating wallet for $target..."
        # Switch back to default to create wallet
        dfx identity use default > /dev/null 2>&1
        
        # Create wallet
        WALLET_CANISTER=$(dfx wallet create-wallet $principal --network local 2>/dev/null || true)
        
        if [ -z "$WALLET_CANISTER" ]; then
            echo "  ❌ Failed to create wallet for $target"
            continue
        fi
        
        echo "  Created wallet: $WALLET_CANISTER"
        
        # Send cycles to the new wallet
        echo "  Sending $FUND_AMOUNT cycles..."
        if dfx wallet send $WALLET_CANISTER $FUND_AMOUNT --network local > /dev/null 2>&1; then
            echo "  ✅ Successfully funded $target"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "  ❌ Failed to send cycles to $target"
        fi
    else
        EXISTING_WALLET=$(dfx identity get-wallet --network local)
        echo "  Wallet exists: $EXISTING_WALLET"
        
        # Switch back to default to send cycles
        dfx identity use default > /dev/null 2>&1
        
        echo "  Sending $FUND_AMOUNT cycles..."
        if dfx wallet send $EXISTING_WALLET $FUND_AMOUNT --network local > /dev/null 2>&1; then
            echo "  ✅ Successfully funded $target"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "  ❌ Failed to send cycles to $target"
        fi
    fi
done

# Switch back to default
dfx identity use default > /dev/null 2>&1

# Final summary
echo ""
echo "✅ FUNDING COMPLETE"
echo "Successfully funded: $SUCCESS_COUNT/${#TARGETS_TO_FUND[@]}"
echo "Amount per wallet: $FUND_AMOUNT cycles"
echo "Total sent: $((SUCCESS_COUNT * FUND_AMOUNT)) cycles"

# Save wallet info for tests
cat > wallets.json <<EOF
{
  "network": "local",
  "wallets": {
    "user": {
      "principal": "$USER_PRINCIPAL"
    },
    "resolver0": {
      "principal": "$RESOLVER0_PRINCIPAL"
    },
    "resolver1": {
      "principal": "$RESOLVER1_PRINCIPAL"
    },
    "resolver2": {
      "principal": "$RESOLVER2_PRINCIPAL"
    },
    "resolver3": {
      "principal": "$RESOLVER3_PRINCIPAL"
    },
    "deployer": {
      "principal": "$DEPLOYER_PRINCIPAL"
    }
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Wallet info saved to wallets.json"