#!/bin/bash

set -e

echo "🚀 Starting Unite DeFi ICP MAINNET deployment..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found. Please create one with your configuration."
    exit 1
fi

# Ensure we're using the deployer identity
dfx identity use $ICP_DEPLOYER_IDENTITY
DEPLOYER=$(dfx identity get-principal)

echo "Deployer Identity: $ICP_DEPLOYER_IDENTITY"
echo "Deployer Principal: $DEPLOYER"
echo "Expected Principal: $ICP_DEPLOYER_PRINCIPAL"

# Verify deployer principal matches
if [ "$DEPLOYER" != "$ICP_DEPLOYER_PRINCIPAL" ]; then
    echo "❌ Deployer principal mismatch!"
    echo "Expected: $ICP_DEPLOYER_PRINCIPAL"
    echo "Actual: $DEPLOYER"
    exit 1
fi

# Check cycles balance
if ! dfx identity get-wallet --network ic > /dev/null 2>&1; then
    echo "❌ No cycles wallet found for deployer."
    echo "Please create a cycles wallet first:"
    echo "dfx identity deploy-wallet --network ic"
    exit 1
fi

CYCLES_BALANCE=$(dfx wallet balance --network ic)
echo "Deployer cycles balance: $CYCLES_BALANCE"

# Check minimum cycles (5T cycles required for all deployments)
MIN_CYCLES=5000000000000
echo "Minimum required cycles: $MIN_CYCLES"

# Extract numeric value from balance (assuming format like "4.567 TC")
NUMERIC_BALANCE=$(echo $CYCLES_BALANCE | grep -o '[0-9.]*' | head -1)
BALANCE_UNIT=$(echo $CYCLES_BALANCE | grep -o '[KMGT]C' | head -1)

# Convert to cycles for comparison
case $BALANCE_UNIT in
    "TC") BALANCE_CYCLES=$(echo "$NUMERIC_BALANCE * 1000000000000" | bc -l) ;;
    "GC") BALANCE_CYCLES=$(echo "$NUMERIC_BALANCE * 1000000000" | bc -l) ;;
    "MC") BALANCE_CYCLES=$(echo "$NUMERIC_BALANCE * 1000000" | bc -l) ;;
    "KC") BALANCE_CYCLES=$(echo "$NUMERIC_BALANCE * 1000" | bc -l) ;;
    *) BALANCE_CYCLES=$NUMERIC_BALANCE ;;
esac

if (( $(echo "$BALANCE_CYCLES < $MIN_CYCLES" | bc -l) )); then
    echo "❌ Insufficient cycles for deployment"
    echo "Required: 5T cycles"
    echo "Available: $CYCLES_BALANCE"
    echo "Please fund your cycles wallet:"
    echo "dfx wallet --network ic balance"
    exit 1
fi

echo "✅ Sufficient cycles available for deployment"

echo ""
echo "=== DEPLOYING TO ICP MAINNET ==="
echo "Network: IC Mainnet"
echo "Deployer: $DEPLOYER"

# Deploy contracts in dependency order
echo ""
echo "📦 Deploying UniteLimitOrderProtocol..."
dfx deploy unite_limit_order_protocol --network ic --with-cycles=$INITIAL_CYCLES_PER_CANISTER

echo "📦 Deploying UniteEscrowFactory..."
dfx deploy unite_escrow_factory --network ic --with-cycles=$INITIAL_CYCLES_PER_CANISTER

echo "📦 Deploying UniteResolver..."
# For UniteResolver, we need to pass the factory and LOP canister IDs
FACTORY_ID=$(dfx canister id unite_escrow_factory --network ic)
LOP_ID=$(dfx canister id unite_limit_order_protocol --network ic)

# Create a temporary dfx.json entry for UniteResolver with proper initialization
dfx deploy unite_resolver --network ic --with-cycles=$INITIAL_CYCLES_PER_CANISTER --argument "(record { factory = principal \"$FACTORY_ID\"; limitOrderProtocol = principal \"$LOP_ID\"; owner = principal \"$DEPLOYER\" })"

echo "📦 Deploying Mock USDT..."
dfx deploy mock_usdt --network ic --with-cycles=$INITIAL_CYCLES_PER_CANISTER

echo "📦 Deploying Mock DAI..."
dfx deploy mock_dai --network ic --with-cycles=$INITIAL_CYCLES_PER_CANISTER

# Get all deployed canister IDs
LOP_ID=$(dfx canister id unite_limit_order_protocol --network ic)
FACTORY_ID=$(dfx canister id unite_escrow_factory --network ic)
RESOLVER_ID=$(dfx canister id unite_resolver --network ic)
USDT_ID=$(dfx canister id mock_usdt --network ic)
DAI_ID=$(dfx canister id mock_dai --network ic)

echo ""
echo "=== DEPLOYED ADDRESSES ==="
echo "UniteLimitOrderProtocol: $LOP_ID"
echo "UniteEscrowFactory: $FACTORY_ID"
echo "UniteResolver: $RESOLVER_ID"
echo "MockUSDT: $USDT_ID"
echo "MockDAI: $DAI_ID"

# Create mainnet deployments file
cat > deployments_mainnet.json <<EOF
{
  "icp": {
    "mainnet": {
      "chainId": 223,
      "name": "Internet Computer Mainnet",
      "deployer": "$DEPLOYER",
      "network": "ic",
      "UniteLimitOrderProtocol": "$LOP_ID",
      "UniteEscrowFactory": "$FACTORY_ID",
      "UniteResolver": "$RESOLVER_ID",
      "MockUSDT": "$USDT_ID",
      "MockDAI": "$DAI_ID",
      "deploymentTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
  }
}
EOF

echo ""
echo "=== MAINNET DEPLOYMENT JSON ==="
echo "\"icp\": {"
echo "  \"mainnet\": {"
echo "    \"chainId\": 223,"
echo "    \"name\": \"Internet Computer Mainnet\","
echo "    \"deployer\": \"$DEPLOYER\","
echo "    \"UniteLimitOrderProtocol\": \"$LOP_ID\","
echo "    \"UniteEscrowFactory\": \"$FACTORY_ID\","
echo "    \"UniteResolver\": \"$RESOLVER_ID\","
echo "    \"MockUSDT\": \"$USDT_ID\","
echo "    \"MockDAI\": \"$DAI_ID\""
echo "  }"
echo "}"

echo ""
echo "✅ MAINNET DEPLOYMENT COMPLETE!"
echo "Deployment info saved to deployments_mainnet.json"
echo ""
echo "🔥 NEXT STEPS:"
echo "1. Fund resolver and user wallets with cycles"
echo "2. Run ./scripts/FundMainnetWallets.sh"
echo "3. Run ./scripts/MintMainnetTokens.sh"
echo ""
echo "💡 Canister URLs:"
echo "- LOP: https://$LOP_ID.ic0.app"
echo "- Factory: https://$FACTORY_ID.ic0.app"
echo "- Resolver: https://$RESOLVER_ID.ic0.app"
echo "- USDT: https://$USDT_ID.ic0.app"
echo "- DAI: https://$DAI_ID.ic0.app"