#!/bin/bash

set -e

echo "🚀 Starting Unite DeFi ICP deployment..."

# Check if dfx is running
if ! dfx ping > /dev/null 2>&1; then
    echo "Starting local dfx network..."
    dfx start --clean --background
    sleep 5
fi

# Get current identity
DEPLOYER=$(dfx identity get-principal)
echo "Deployer Principal: $DEPLOYER"

# Check if deployer has cycles wallet
if ! dfx identity get-wallet --network local > /dev/null 2>&1; then
    echo "Creating wallet for deployer..."
    dfx ledger create-canister --network local --amount 20 $DEPLOYER
    dfx identity set-wallet --network local $(dfx ledger create-canister --network local --amount 20 $DEPLOYER)
fi

CYCLES=$(dfx wallet balance --network local)
echo "Deployer wallet cycles: $CYCLES"

# Set minimum cycles requirement (100 billion cycles)
MIN_CYCLES=100000000000
CURRENT_CYCLES=$(echo $CYCLES | grep -o '[0-9]*' | head -1)

if [ "$CURRENT_CYCLES" -lt "$MIN_CYCLES" ]; then
    echo "❌ Insufficient cycles in deployer wallet"
    echo "Required: $MIN_CYCLES cycles"
    echo "Available: $CURRENT_CYCLES cycles"
    echo "Please fund the deployer wallet with more cycles"
    exit 1
fi

echo "=== DEPLOYING ALL CONTRACTS ==="
echo "Chain: ICP Local"
echo "Deployer: $DEPLOYER"

# Deploy contracts in dependency order
echo "📦 Deploying UniteLimitOrderProtocol..."
dfx deploy unite_limit_order_protocol --network local

echo "📦 Deploying UniteEscrowFactory..."
dfx deploy unite_escrow_factory --network local

echo "📦 Deploying UniteResolver..."
dfx deploy unite_resolver --network local

echo "📦 Deploying Mock USDT..."
dfx deploy mock_usdt --network local

echo "📦 Deploying Mock DAI..."
dfx deploy mock_dai --network local

# Get canister IDs
LOP_ID=$(dfx canister id unite_limit_order_protocol --network local)
FACTORY_ID=$(dfx canister id unite_escrow_factory --network local)
RESOLVER_ID=$(dfx canister id unite_resolver --network local)
USDT_ID=$(dfx canister id mock_usdt --network local)
DAI_ID=$(dfx canister id mock_dai --network local)

echo ""
echo "=== DEPLOYED ADDRESSES ==="
echo "UniteLimitOrderProtocol: $LOP_ID"
echo "UniteEscrowFactory: $FACTORY_ID"
echo "UniteResolver: $RESOLVER_ID"
echo "MockUSDT: $USDT_ID"
echo "MockDAI: $DAI_ID"

# Create deployments.json
cat > deployments.json <<EOF
{
  "icp": {
    "local": {
      "chainId": 223,
      "name": "Internet Computer Local",
      "UniteLimitOrderProtocol": "$LOP_ID",
      "UniteEscrowFactory": "$FACTORY_ID",
      "UniteResolver": "$RESOLVER_ID",
      "MockUSDT": "$USDT_ID",
      "MockDAI": "$DAI_ID"
    }
  }
}
EOF

echo ""
echo "=== COPY TO DEPLOYMENTS.JSON ==="
echo "\"icp\": {"
echo "  \"local\": {"
echo "    \"chainId\": 223,"
echo "    \"name\": \"Internet Computer Local\","
echo "    \"UniteLimitOrderProtocol\": \"$LOP_ID\","
echo "    \"UniteEscrowFactory\": \"$FACTORY_ID\","
echo "    \"UniteResolver\": \"$RESOLVER_ID\","
echo "    \"MockUSDT\": \"$USDT_ID\","
echo "    \"MockDAI\": \"$DAI_ID\""
echo "  }"
echo "}"

echo ""
echo "✅ DEPLOYMENT COMPLETE"
echo "Deployment info saved to deployments.json"