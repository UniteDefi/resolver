#!/bin/bash

set -e

echo "🪙 Starting mainnet token minting..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found. Please create one with your configuration."
    exit 1
fi

# Check if required files exist
if [ ! -f "deployments_mainnet.json" ]; then
    echo "❌ deployments_mainnet.json not found. Please run DeployMainnet.sh first."
    exit 1
fi

if [ ! -f "wallets_mainnet.json" ]; then
    echo "❌ wallets_mainnet.json not found. Please run FundMainnetWallets.sh first."
    exit 1
fi

# Read deployment data
USDT_ID=$(grep -o '"MockUSDT": "[^"]*"' deployments_mainnet.json | cut -d'"' -f4)
DAI_ID=$(grep -o '"MockDAI": "[^"]*"' deployments_mainnet.json | cut -d'"' -f4)

echo "=== MINTING MAINNET TOKENS ==="
echo "Network: IC Mainnet"
echo "USDT Canister: $USDT_ID"
echo "DAI Canister: $DAI_ID"
echo ""
echo "Recipients:"
echo "- User: $ICP_USER_PRINCIPAL"
echo "- Resolver-0: $ICP_RESOLVER_PRINCIPAL_0"
echo "- Resolver-1: $ICP_RESOLVER_PRINCIPAL_1"
echo "- Resolver-2: $ICP_RESOLVER_PRINCIPAL_2"
echo "- Resolver-3: $ICP_RESOLVER_PRINCIPAL_3"

# Switch to deployer identity for minting (deployer is token owner)
dfx identity use $ICP_DEPLOYER_IDENTITY

# Mint amounts for production testing
USDT_AMOUNT=1000000000000  # 1,000,000 USDT (6 decimals) 
DAI_AMOUNT=1000000000000000000000000  # 1,000,000 DAI (18 decimals)

echo ""
echo "--- Minting USDT ---"
echo "Amount per wallet: $((USDT_AMOUNT / 1000000)) USDT"

# Array of recipients
RECIPIENTS=("$ICP_USER_PRINCIPAL" "$ICP_RESOLVER_PRINCIPAL_0" "$ICP_RESOLVER_PRINCIPAL_1" "$ICP_RESOLVER_PRINCIPAL_2" "$ICP_RESOLVER_PRINCIPAL_3")
RECIPIENT_NAMES=("User" "Resolver-0" "Resolver-1" "Resolver-2" "Resolver-3")

# Mint USDT to all recipients
USDT_SUCCESS=0
for i in "${!RECIPIENTS[@]}"; do
    recipient="${RECIPIENTS[i]}"
    name="${RECIPIENT_NAMES[i]}"
    
    echo "Minting USDT to $name ($recipient)..."
    
    if dfx canister call mock_usdt mint "(principal \"$recipient\", $USDT_AMOUNT)" --network ic > /dev/null 2>&1; then
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
    
    if dfx canister call mock_dai mint "(principal \"$recipient\", $DAI_AMOUNT)" --network ic > /dev/null 2>&1; then
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
    USDT_BALANCE=$(dfx canister call mock_usdt icrc1_balance_of "(record { owner = principal \"$recipient\"; subaccount = null })" --network ic 2>/dev/null | grep -o '[0-9]*' | head -1)
    if [ -n "$USDT_BALANCE" ]; then
        USDT_READABLE=$((USDT_BALANCE / 1000000))
        echo "  USDT: $USDT_READABLE"
    else
        echo "  USDT: Error reading balance"
    fi
    
    # DAI balance
    DAI_BALANCE=$(dfx canister call mock_dai icrc1_balance_of "(record { owner = principal \"$recipient\"; subaccount = null })" --network ic 2>/dev/null | grep -o '[0-9]*' | head -1)
    if [ -n "$DAI_BALANCE" ]; then
        DAI_READABLE=$((DAI_BALANCE / 1000000000000000000))
        echo "  DAI: $DAI_READABLE"
    else
        echo "  DAI: Error reading balance"
    fi
done

echo ""
echo "✅ MAINNET TOKEN MINTING COMPLETE"
echo "USDT minting success: $USDT_SUCCESS/${#RECIPIENTS[@]}"
echo "DAI minting success: $DAI_SUCCESS/${#RECIPIENTS[@]}"
echo "All wallets should have received:"
echo "- 1,000,000 USDT"
echo "- 1,000,000 DAI"

# Save token info
cat > tokens_mainnet.json <<EOF
{
  "network": "ic",
  "tokens": {
    "USDT": {
      "canisterId": "$USDT_ID",
      "name": "Mock USDT",
      "symbol": "mUSDT",
      "decimals": 6,
      "amountMintedPerWallet": $USDT_AMOUNT,
      "totalMinted": $((USDT_SUCCESS * USDT_AMOUNT))
    },
    "DAI": {
      "canisterId": "$DAI_ID",
      "name": "Mock DAI",
      "symbol": "mDAI",
      "decimals": 18,
      "amountMintedPerWallet": $DAI_AMOUNT,
      "totalMinted": $((DAI_SUCCESS * DAI_AMOUNT))
    }
  },
  "minting": {
    "usdtSuccessCount": $USDT_SUCCESS,
    "daiSuccessCount": $DAI_SUCCESS,
    "totalRecipients": ${#RECIPIENTS[@]}
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "Token info saved to tokens_mainnet.json"
echo ""
echo "🔗 Token Canister URLs:"
echo "- USDT: https://$USDT_ID.ic0.app"
echo "- DAI: https://$DAI_ID.ic0.app"