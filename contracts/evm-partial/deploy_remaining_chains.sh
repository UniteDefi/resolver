#!/bin/bash

# Load environment variables
source .env

# Track deployments
DEPLOYMENTS_JSON="deployments.json"

# Function to deploy on a specific chain
deploy_chain() {
    local CHAIN_NAME=$1
    local CHAIN_ID=$2
    local RPC_URL=$3
    local CHAIN_DISPLAY_NAME=$4
    
    echo "🚀 Deploying on $CHAIN_DISPLAY_NAME (Chain ID: $CHAIN_ID)..."
    echo "   RPC URL: $RPC_URL"
    
    # Deploy mock tokens
    echo "   📦 Deploying mock tokens..."
    MOCK_OUTPUT=$(FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/DeployMocks.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast --json 2>&1)
    
    if [ $? -ne 0 ]; then
        echo "   ❌ Mock token deployment failed on $CHAIN_DISPLAY_NAME"
        echo "   Error: $MOCK_OUTPUT"
        return 1
    fi
    
    # Extract mock token addresses from logs
    MOCK_USDT=$(echo "$MOCK_OUTPUT" | grep -o "MockUSDT: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | head -1)
    MOCK_DAI=$(echo "$MOCK_OUTPUT" | grep -o "MockDAI: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | head -1)
    MOCK_WRAPPED=$(echo "$MOCK_OUTPUT" | grep -o "MockWrappedNative: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | head -1)
    
    echo "   MockUSDT: $MOCK_USDT"
    echo "   MockDAI: $MOCK_DAI"
    echo "   MockWrappedNative: $MOCK_WRAPPED"
    
    # Deploy main contracts
    echo "   📦 Deploying main contracts..."
    MAIN_OUTPUT=$(FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/Deploy.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast --json 2>&1)
    
    if [ $? -ne 0 ]; then
        echo "   ❌ Main contract deployment failed on $CHAIN_DISPLAY_NAME"
        echo "   Error: $MAIN_OUTPUT"
        return 1
    fi
    
    # Extract main contract addresses from logs
    LOP=$(echo "$MAIN_OUTPUT" | grep -o "UniteLimitOrderProtocol: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | head -1)
    FACTORY=$(echo "$MAIN_OUTPUT" | grep -o "UniteEscrowFactory: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | head -1)
    RESOLVER0=$(echo "$MAIN_OUTPUT" | grep -o "UniteResolver0: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | head -1)
    RESOLVER1=$(echo "$MAIN_OUTPUT" | grep -o "UniteResolver1: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | head -1)
    
    echo "   UniteLimitOrderProtocol: $LOP"
    echo "   UniteEscrowFactory: $FACTORY"
    echo "   UniteResolver0: $RESOLVER0"
    echo "   UniteResolver1: $RESOLVER1"
    
    # Update FundResolversNew.s.sol with token addresses
    echo "   📝 Updating FundResolversNew.s.sol..."
    sed -i.bak "/\/\/ Token addresses will be populated after deployment/i\\
        // $CHAIN_DISPLAY_NAME\\
        if (chainId == $CHAIN_ID) {\\
            return (\\
                $MOCK_USDT, // MockUSDT\\
                $MOCK_DAI, // MockDAI\\
                $MOCK_WRAPPED  // MockWrappedNative\\
            );\\
        }\\
        " script/FundResolversNew.s.sol
    
    # Fund resolvers
    echo "   💰 Funding resolvers..."
    FUND_OUTPUT=$(FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/FundResolversNew.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast 2>&1)
    
    if [ $? -ne 0 ]; then
        echo "   ⚠️  Funding failed on $CHAIN_DISPLAY_NAME (non-critical)"
        echo "   Error: $FUND_OUTPUT"
    else
        echo "   ✅ Funding complete on $CHAIN_DISPLAY_NAME"
    fi
    
    echo "   ✅ Deployment complete on $CHAIN_DISPLAY_NAME"
    echo ""
    
    # Update deployments.json
    echo "   📝 Updating deployments.json..."
    
    # Create deployment JSON entry
    DEPLOYMENT_ENTRY=$(cat <<EOF
    "$CHAIN_NAME": {
      "chainId": $CHAIN_ID,
      "name": "$CHAIN_DISPLAY_NAME",
      "UniteLimitOrderProtocol": "$LOP",
      "UniteEscrowFactory": "$FACTORY",
      "UniteResolver0": "$RESOLVER0",
      "UniteResolver1": "$RESOLVER1",
      "MockUSDT": "$MOCK_USDT",
      "MockDAI": "$MOCK_DAI",
      "MockWrappedNative": "$MOCK_WRAPPED"
    }
EOF
)
    
    echo "$DEPLOYMENT_ENTRY"
    
    return 0
}

echo "🌐 Starting remaining chain deployments..."
echo "=================================="

# Deploy on remaining chains
# injective_testnet
if [ ! -z "$INJECTIVE_TESTNET_RPC_URL" ]; then
    deploy_chain "injective_testnet" "2424" "$INJECTIVE_TESTNET_RPC_URL" "Injective Testnet"
fi

# aurora_testnet
if [ ! -z "$AURORA_TESTNET_RPC_URL" ]; then
    deploy_chain "aurora_testnet" "1313161555" "$AURORA_TESTNET_RPC_URL" "Aurora Testnet"
fi

# bnb_testnet (need to check if we have RPC URL)
if [ ! -z "$BNB_TESTNET_RPC_URL" ]; then
    deploy_chain "bnb_testnet" "97" "$BNB_TESTNET_RPC_URL" "BNB Testnet"
else
    echo "⚠️  BNB Testnet RPC URL not found, using public RPC"
    deploy_chain "bnb_testnet" "97" "https://data-seed-prebsc-1-s1.binance.org:8545" "BNB Testnet"
fi

# op_sepolia
if [ ! -z "$OP_SEPOLIA_RPC_URL" ]; then
    deploy_chain "op_sepolia" "11155420" "$OP_SEPOLIA_RPC_URL" "Optimism Sepolia"
fi

# polygon_amoy
if [ ! -z "$POLYGON_AMOY_RPC_URL" ]; then
    deploy_chain "polygon_amoy" "80002" "$POLYGON_AMOY_RPC_URL" "Polygon Amoy"
fi

# scroll_sepolia
if [ ! -z "$SCROLL_SEPOLIA_RPC_URL" ]; then
    deploy_chain "scroll_sepolia" "534351" "$SCROLL_SEPOLIA_RPC_URL" "Scroll Sepolia"
fi

# celo_alfajores
if [ ! -z "$CELO_ALFAJORES_RPC_URL" ]; then
    deploy_chain "celo_alfajores" "44787" "$CELO_ALFAJORES_RPC_URL" "Celo Alfajores"
fi

# unichain_sepolia
if [ ! -z "$UNICHAIN_SEPOLIA_RPC_URL" ]; then
    deploy_chain "unichain_sepolia" "1301" "$UNICHAIN_SEPOLIA_RPC_URL" "Unichain Sepolia"
fi

# flow_testnet
if [ ! -z "$FLOW_TESTNET_RPC_URL" ]; then
    deploy_chain "flow_testnet" "545" "$FLOW_TESTNET_RPC_URL" "Flow Testnet"
fi

# sei_testnet
if [ ! -z "$SEI_TESTNET_RPC_URL" ]; then
    deploy_chain "sei_testnet" "713715" "$SEI_TESTNET_RPC_URL" "Sei Testnet"
fi

echo ""
echo "=================================="
echo "📊 All deployments complete!"
echo "Please manually update deployments.json with the deployment data shown above"