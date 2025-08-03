#!/bin/bash

set -e

echo "🪙 Starting token minting..."

# Check if required files exist
if [ ! -f "deployments.json" ]; then
    echo "❌ deployments.json not found. Please run DeployAll.sh first."
    exit 1
fi

if [ ! -f "wallets.json" ]; then
    echo "❌ wallets.json not found. Please run FundWallets.sh first."
    exit 1
fi

# Read deployment data
USDT_ID=$(grep -o '"MockUSDT": "[^"]*"' deployments.json | cut -d'"' -f4)
DAI_ID=$(grep -o '"MockDAI": "[^"]*"' deployments.json | cut -d'"' -f4)

# Read wallet data
USER_PRINCIPAL=$(grep -o '"principal": "[^"]*"' wallets.json | head -1 | cut -d'"' -f4)
RESOLVER0_PRINCIPAL=$(grep -A 3 '"resolver0"' wallets.json | grep -o '"principal": "[^"]*"' | cut -d'"' -f4)
RESOLVER1_PRINCIPAL=$(grep -A 3 '"resolver1"' wallets.json | grep -o '"principal": "[^"]*"' | cut -d'"' -f4)
RESOLVER2_PRINCIPAL=$(grep -A 3 '"resolver2"' wallets.json | grep -o '"principal": "[^"]*"' | cut -d'"' -f4)
RESOLVER3_PRINCIPAL=$(grep -A 3 '"resolver3"' wallets.json | grep -o '"principal": "[^"]*"' | cut -d'"' -f4)

echo "=== MINTING TOKENS ==="
echo "Chain: ICP Local"
echo "USDT Canister: $USDT_ID"
echo "DAI Canister: $DAI_ID"
echo ""
echo "Recipients:"
echo "- User: $USER_PRINCIPAL"
echo "- Resolver0: $RESOLVER0_PRINCIPAL"
echo "- Resolver1: $RESOLVER1_PRINCIPAL"
echo "- Resolver2: $RESOLVER2_PRINCIPAL"
echo "- Resolver3: $RESOLVER3_PRINCIPAL"

# Switch to default identity for minting (deployer is token owner)
dfx identity use default > /dev/null 2>&1

# Mint amounts
USDT_AMOUNT=10000000000  # 10,000 USDT (6 decimals)
DAI_AMOUNT=10000000000000000000000  # 10,000 DAI (18 decimals)

echo ""
echo "--- Minting USDT ---"
echo "Amount per wallet: $((USDT_AMOUNT / 1000000)) USDT"

# Array of recipients
RECIPIENTS=("$USER_PRINCIPAL" "$RESOLVER0_PRINCIPAL" "$RESOLVER1_PRINCIPAL" "$RESOLVER2_PRINCIPAL" "$RESOLVER3_PRINCIPAL")
RECIPIENT_NAMES=("User" "Resolver0" "Resolver1" "Resolver2" "Resolver3")

# Mint USDT to all recipients
USDT_SUCCESS=0
for i in "${!RECIPIENTS[@]}"; do
    recipient="${RECIPIENTS[i]}"
    name="${RECIPIENT_NAMES[i]}"
    
    echo "Minting USDT to $name ($recipient)..."
    
    if dfx canister call mock_usdt mint "(principal \"$recipient\", $USDT_AMOUNT)" --network local > /dev/null 2>&1; then
        echo "  ✅ Successfully minted USDT to $name"
        USDT_SUCCESS=$((USDT_SUCCESS + 1))
    else
        echo "  ❌ Failed to mint USDT to $name"
    fi
done

echo ""
echo "--- Minting DAI ---"
echo "Amount per wallet: $((DAI_AMOUNT / 1000000000000000000)) DAI"

# Mint DAI to all recipients
DAI_SUCCESS=0
for i in "${!RECIPIENTS[@]}"; do
    recipient="${RECIPIENTS[i]}"
    name="${RECIPIENT_NAMES[i]}"
    
    echo "Minting DAI to $name ($recipient)..."
    
    if dfx canister call mock_dai mint "(principal \"$recipient\", $DAI_AMOUNT)" --network local > /dev/null 2>&1; then
        echo "  ✅ Successfully minted DAI to $name"
        DAI_SUCCESS=$((DAI_SUCCESS + 1))
    else
        echo "  ❌ Failed to mint DAI to $name"
    fi
done

echo ""
echo "--- Checking Balances ---"

# Check balances
for i in "${!RECIPIENTS[@]}"; do
    recipient="${RECIPIENTS[i]}"
    name="${RECIPIENT_NAMES[i]}"
    
    echo "$name balances:"
    
    # USDT balance
    USDT_BALANCE=$(dfx canister call mock_usdt icrc1_balance_of "(record { owner = principal \"$recipient\"; subaccount = null })" --network local 2>/dev/null | grep -o '[0-9]*' | head -1)
    if [ -n "$USDT_BALANCE" ]; then
        USDT_READABLE=$((USDT_BALANCE / 1000000))
        echo "  USDT: $USDT_READABLE"
    else
        echo "  USDT: Error reading balance"
    fi
    
    # DAI balance
    DAI_BALANCE=$(dfx canister call mock_dai icrc1_balance_of "(record { owner = principal \"$recipient\"; subaccount = null })" --network local 2>/dev/null | grep -o '[0-9]*' | head -1)
    if [ -n "$DAI_BALANCE" ]; then
        DAI_READABLE=$((DAI_BALANCE / 1000000000000000000))
        echo "  DAI: $DAI_READABLE"
    else
        echo "  DAI: Error reading balance"
    fi
done

echo ""
echo "✅ TOKEN MINTING COMPLETE"
echo "USDT minting success: $USDT_SUCCESS/${#RECIPIENTS[@]}"
echo "DAI minting success: $DAI_SUCCESS/${#RECIPIENTS[@]}"
echo "All wallets should have received:"
echo "- 10,000 USDT"
echo "- 10,000 DAI"