#!/bin/bash

# Load environment variables
source .env

# Function to deploy and update JSON
deploy_chain() {
    local CHAIN_NAME=$1
    local CHAIN_ID=$2
    local RPC_URL=$3
    local CHAIN_DISPLAY=$4
    
    echo ""
    echo "🚀 Deploying on $CHAIN_DISPLAY (Chain ID: $CHAIN_ID)..."
    
    # Deploy mock tokens
    echo "   📦 Deploying mock tokens..."
    MOCK_OUTPUT=$(FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/DeployMocks.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast 2>&1)
    
    if [ $? -eq 0 ]; then
        MOCK_USDT=$(echo "$MOCK_OUTPUT" | grep -o "MockUSDT: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | tail -1)
        MOCK_DAI=$(echo "$MOCK_OUTPUT" | grep -o "MockDAI: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | tail -1)
        MOCK_WRAPPED=$(echo "$MOCK_OUTPUT" | grep -o "MockWrappedNative: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | tail -1)
        echo "   ✅ Mock tokens deployed"
    else
        echo "   ❌ Mock token deployment failed"
        return 1
    fi
    
    # Deploy main contracts
    echo "   📦 Deploying main contracts..."
    MAIN_OUTPUT=$(FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/Deploy.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast 2>&1)
    
    if [ $? -eq 0 ]; then
        LOP=$(echo "$MAIN_OUTPUT" | grep -o "UniteLimitOrderProtocol: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | tail -1)
        FACTORY=$(echo "$MAIN_OUTPUT" | grep -o "UniteEscrowFactory: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | tail -1)
        RESOLVER0=$(echo "$MAIN_OUTPUT" | grep -o "UniteResolver0: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | tail -1)
        RESOLVER1=$(echo "$MAIN_OUTPUT" | grep -o "UniteResolver1: 0x[a-fA-F0-9]\{40\}" | cut -d' ' -f2 | tail -1)
        echo "   ✅ Main contracts deployed"
    else
        echo "   ❌ Main contract deployment failed"
        return 1
    fi
    
    # Add token addresses to FundResolversNew.s.sol
    echo "   📝 Updating FundResolversNew.s.sol..."
    sed -i.bak "/\/\/ Token addresses will be populated after deployment/i\\
        // $CHAIN_DISPLAY\\
        if (chainId == $CHAIN_ID) {\\
            return (\\
                $MOCK_USDT, // MockUSDT\\
                $MOCK_DAI, // MockDAI\\
                $MOCK_WRAPPED  // MockWrappedNative\\
            );\\
        }\\
        " script/FundResolversNew.s.sol
    
    # Try to fund resolvers
    echo "   💰 Attempting to fund resolvers..."
    FOUNDRY_ETH_RPC_URL=$RPC_URL forge script script/FundResolversNew.s.sol --private-key $DEPLOYER_PRIVATE_KEY --broadcast 2>&1
    
    echo ""
    echo "   ✅ Deployment complete for $CHAIN_DISPLAY"
    echo "   Please add the following to deployments.json:"
    echo ""
    echo "    \"$CHAIN_NAME\": {"
    echo "      \"chainId\": $CHAIN_ID,"
    echo "      \"name\": \"$CHAIN_DISPLAY\","
    echo "      \"UniteLimitOrderProtocol\": \"$LOP\","
    echo "      \"UniteEscrowFactory\": \"$FACTORY\","
    echo "      \"UniteResolver0\": \"$RESOLVER0\","
    echo "      \"UniteResolver1\": \"$RESOLVER1\","
    echo "      \"MockUSDT\": \"$MOCK_USDT\","
    echo "      \"MockDAI\": \"$MOCK_DAI\","
    echo "      \"MockWrappedNative\": \"$MOCK_WRAPPED\""
    echo "    },"
    echo ""
}

# Deploy on remaining chains
echo "🌐 Starting batch deployment..."
echo "=================================="

# BNB Testnet
deploy_chain "bnb_testnet" "97" "https://data-seed-prebsc-1-s1.binance.org:8545" "BNB Testnet"

# Optimism Sepolia
if [ ! -z "$OP_SEPOLIA_RPC_URL" ]; then
    deploy_chain "op_sepolia" "11155420" "$OP_SEPOLIA_RPC_URL" "Optimism Sepolia"
fi

# Polygon Amoy
if [ ! -z "$POLYGON_AMOY_RPC_URL" ]; then
    deploy_chain "polygon_amoy" "80002" "$POLYGON_AMOY_RPC_URL" "Polygon Amoy"
fi

# Scroll Sepolia
if [ ! -z "$SCROLL_SEPOLIA_RPC_URL" ]; then
    deploy_chain "scroll_sepolia" "534351" "$SCROLL_SEPOLIA_RPC_URL" "Scroll Sepolia"
fi

# Celo Alfajores
if [ ! -z "$CELO_ALFAJORES_RPC_URL" ]; then
    deploy_chain "celo_alfajores" "44787" "$CELO_ALFAJORES_RPC_URL" "Celo Alfajores"
fi

# Unichain Sepolia
if [ ! -z "$UNICHAIN_SEPOLIA_RPC_URL" ]; then
    deploy_chain "unichain_sepolia" "1301" "$UNICHAIN_SEPOLIA_RPC_URL" "Unichain Sepolia"
fi

# Flow Testnet
if [ ! -z "$FLOW_TESTNET_RPC_URL" ]; then
    deploy_chain "flow_testnet" "545" "$FLOW_TESTNET_RPC_URL" "Flow Testnet"
fi

# Sei Testnet
if [ ! -z "$SEI_TESTNET_RPC_URL" ]; then
    deploy_chain "sei_testnet" "713715" "$SEI_TESTNET_RPC_URL" "Sei Testnet"
fi

echo ""
echo "=================================="
echo "📊 Batch deployment complete!"