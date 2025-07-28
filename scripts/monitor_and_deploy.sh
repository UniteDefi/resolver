#!/bin/bash

# Monitor wallet and deploy when funds arrive
WALLET_ADDRESS="0x90A4126eaf37b848561337cE8C6d4c1Ab7d796D4"
ETHERLINK_RPC="https://node.ghostnet.etherlink.com"
BASE_SEPOLIA_RPC="https://sepolia.base.org"
MIN_BALANCE="30000000000000000" # 0.03 ETH in wei

echo "Monitoring wallet $WALLET_ADDRESS for funds..."
echo "Minimum required balance: 0.03 ETH per chain"

check_balance() {
    local rpc_url=$1
    local chain_name=$2
    
    balance=$(cast balance $WALLET_ADDRESS --rpc-url $rpc_url)
    balance_eth=$(cast --to-unit $balance ether)
    
    echo "[$chain_name] Balance: $balance_eth ETH"
    
    if [ "$balance" -gt "$MIN_BALANCE" ]; then
        return 0
    else
        return 1
    fi
}

deploy_contracts() {
    local rpc_url=$1
    local chain_name=$2
    
    echo "🚀 Deploying contracts on $chain_name..."
    
    forge script script/DeployRelayerService.s.sol \
        --rpc-url $rpc_url \
        --broadcast \
        --env-file .env.deployment \
        --slow
    
    if [ $? -eq 0 ]; then
        echo "✅ Deployment successful on $chain_name"
        return 0
    else
        echo "❌ Deployment failed on $chain_name"
        return 1
    fi
}

run_tests() {
    local rpc_url=$1
    local chain_name=$2
    
    echo "🧪 Running tests on $chain_name..."
    
    forge script script/TestCrosschainSwap.s.sol \
        --rpc-url $rpc_url \
        --broadcast \
        --env-file .env.deployment \
        --slow
    
    if [ $? -eq 0 ]; then
        echo "✅ Tests completed on $chain_name"
        return 0
    else
        echo "❌ Tests failed on $chain_name"
        return 1
    fi
}

# Main monitoring loop
while true; do
    echo "$(date): Checking balances..."
    
    etherlink_funded=false
    base_funded=false
    
    if check_balance $ETHERLINK_RPC "Etherlink"; then
        etherlink_funded=true
    fi
    
    if check_balance $BASE_SEPOLIA_RPC "Base Sepolia"; then
        base_funded=true
    fi
    
    # Deploy when funds are available
    if [ "$etherlink_funded" = true ] && [ "$base_funded" = true ]; then
        echo "💰 Both chains funded! Starting deployment..."
        
        # Deploy on Etherlink
        if deploy_contracts $ETHERLINK_RPC "Etherlink"; then
            # Deploy on Base Sepolia
            if deploy_contracts $BASE_SEPOLIA_RPC "Base Sepolia"; then
                echo "🎉 All deployments successful!"
                
                # Run tests
                echo "Starting cross-chain tests..."
                run_tests $ETHERLINK_RPC "Etherlink"
                run_tests $BASE_SEPOLIA_RPC "Base Sepolia"
                
                echo "🏁 All operations completed!"
                break
            fi
        fi
    else
        echo "⏳ Waiting for funds... (checking again in 30 seconds)"
        sleep 30
    fi
done