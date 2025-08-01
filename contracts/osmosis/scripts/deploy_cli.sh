#!/bin/bash

# Osmosis CLI deployment script for Counter contract
# Requires osmosisd CLI to be installed and configured

set -e

# Configuration
CHAIN_ID=${CHAIN_ID:-"osmo-test-5"}
NODE=${NODE:-"https://rpc.testnet.osmosis.zone:443"}
GAS_PRICES=${GAS_PRICES:-"0.025uosmo"}
KEYRING_BACKEND=${KEYRING_BACKEND:-"test"}
KEY_NAME=${KEY_NAME:-"deployer"}
INITIAL_COUNT=${INITIAL_COUNT:-"0"}

# Contract paths
WASM_FILE="../contracts/counter/target/wasm32-unknown-unknown/release/counter.wasm"
ARTIFACTS_DIR="../artifacts"

echo "=== Osmosis Counter Contract Deployment ==="
echo "Chain ID: $CHAIN_ID"
echo "Node: $NODE"
echo "Key: $KEY_NAME"
echo ""

# Check if osmosisd is installed
if ! command -v osmosisd &> /dev/null; then
    echo "Error: osmosisd CLI not found. Please install it first."
    echo "Visit: https://docs.osmosis.zone/osmosis-core/osmosisd"
    exit 1
fi

# Check if contract is built
if [ ! -f "$WASM_FILE" ]; then
    echo "Error: Contract WASM not found at $WASM_FILE"
    echo "Please build the contract first with: cargo wasm"
    exit 1
fi

# Get deployer address
DEPLOYER=$(osmosisd keys show $KEY_NAME -a --keyring-backend $KEYRING_BACKEND)
echo "Deployer address: $DEPLOYER"

# Check balance
echo "Checking balance..."
osmosisd query bank balances $DEPLOYER --node $NODE

# Upload contract
echo ""
echo "Uploading contract..."
UPLOAD_TX=$(osmosisd tx wasm store $WASM_FILE \
    --from $KEY_NAME \
    --chain-id $CHAIN_ID \
    --node $NODE \
    --gas-prices $GAS_PRICES \
    --gas auto \
    --gas-adjustment 1.3 \
    --keyring-backend $KEYRING_BACKEND \
    --broadcast-mode block \
    --yes \
    --output json)

CODE_ID=$(echo $UPLOAD_TX | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
echo "Contract uploaded with Code ID: $CODE_ID"

# Prepare instantiate message
INIT_MSG=$(cat <<EOF
{
  "count": "$INITIAL_COUNT"
}
EOF
)

echo ""
echo "Instantiating contract with message: $INIT_MSG"

# Instantiate contract
INSTANTIATE_TX=$(osmosisd tx wasm instantiate $CODE_ID "$INIT_MSG" \
    --from $KEY_NAME \
    --label "counter-contract" \
    --chain-id $CHAIN_ID \
    --node $NODE \
    --gas-prices $GAS_PRICES \
    --gas auto \
    --gas-adjustment 1.3 \
    --keyring-backend $KEYRING_BACKEND \
    --admin $DEPLOYER \
    --broadcast-mode block \
    --yes \
    --output json)

CONTRACT_ADDRESS=$(echo $INSTANTIATE_TX | jq -r '.logs[0].events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value')
echo "Contract instantiated at: $CONTRACT_ADDRESS"

# Query initial state
echo ""
echo "Querying initial count..."
QUERY_MSG='{"get_count":{}}'
osmosisd query wasm contract-state smart $CONTRACT_ADDRESS "$QUERY_MSG" --node $NODE

# Save deployment info
mkdir -p $ARTIFACTS_DIR
DEPLOYMENT_INFO=$(cat <<EOF
{
  "chain_id": "$CHAIN_ID",
  "code_id": $CODE_ID,
  "contract_address": "$CONTRACT_ADDRESS",
  "deployer": "$DEPLOYER",
  "initial_count": "$INITIAL_COUNT",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

echo "$DEPLOYMENT_INFO" > "$ARTIFACTS_DIR/deployment-$CHAIN_ID.json"
echo ""
echo "Deployment info saved to $ARTIFACTS_DIR/deployment-$CHAIN_ID.json"

echo ""
echo "=== Deployment Complete ==="
echo "Code ID: $CODE_ID"
echo "Contract: $CONTRACT_ADDRESS"

# Example interactions
echo ""
echo "Example commands:"
echo "  Increment: osmosisd tx wasm execute $CONTRACT_ADDRESS '{\"increment\":{}}' --from $KEY_NAME --chain-id $CHAIN_ID --node $NODE --gas-prices $GAS_PRICES --keyring-backend $KEYRING_BACKEND --yes"
echo "  Decrement: osmosisd tx wasm execute $CONTRACT_ADDRESS '{\"decrement\":{}}' --from $KEY_NAME --chain-id $CHAIN_ID --node $NODE --gas-prices $GAS_PRICES --keyring-backend $KEYRING_BACKEND --yes"
echo "  Query: osmosisd query wasm contract-state smart $CONTRACT_ADDRESS '{\"get_count\":{}}' --node $NODE"