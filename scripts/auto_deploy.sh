#!/bin/bash

# Comprehensive auto-deployment and testing script
WALLET_ADDRESS="0x90A4126eaf37b848561337cE8C6d4c1Ab7d796D4"
ETHERLINK_RPC="https://node.ghostnet.etherlink.com"
BASE_SEPOLIA_RPC="https://sepolia.base.org"
MIN_BALANCE="20000000000000000" # 0.02 ETH in wei

export PRIVATE_KEY="0xdd3c2387deb87a5ef0109c3ae8a435bf49972bc82f4d8d8a911be1c82f23e380"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_and_deploy() {
    log "🔍 Checking balances..."
    
    # Check Etherlink balance
    etherlink_balance=$(cast balance $WALLET_ADDRESS --rpc-url $ETHERLINK_RPC)
    etherlink_eth=$(cast --to-unit $etherlink_balance ether)
    log "Etherlink balance: $etherlink_eth ETH"
    
    # Check Base Sepolia balance  
    base_balance=$(cast balance $WALLET_ADDRESS --rpc-url $BASE_SEPOLIA_RPC)
    base_eth=$(cast --to-unit $base_balance ether)
    log "Base Sepolia balance: $base_eth ETH"
    
    # Deploy if both chains have sufficient funds
    if [ "$etherlink_balance" -gt "$MIN_BALANCE" ] && [ "$base_balance" -gt "$MIN_BALANCE" ]; then
        log "💰 Sufficient funds detected on both chains!"
        
        # Deploy on Etherlink
        log "🚀 Deploying on Etherlink..."
        forge script script/DeployRelayerService.s.sol \
            --rpc-url $ETHERLINK_RPC \
            --private-key $PRIVATE_KEY \
            --broadcast \
            --slow \
            --legacy
        
        if [ $? -eq 0 ]; then
            log "✅ Etherlink deployment successful"
            
            # Deploy on Base Sepolia
            log "🚀 Deploying on Base Sepolia..."
            forge script script/DeployRelayerService.s.sol \
                --rpc-url $BASE_SEPOLIA_RPC \
                --private-key $PRIVATE_KEY \
                --broadcast \
                --slow
            
            if [ $? -eq 0 ]; then
                log "✅ Base Sepolia deployment successful"
                
                # Run tests
                log "🧪 Running crosschain tests..."
                
                # Test on Etherlink
                log "Testing on Etherlink..."
                forge script script/TestCrosschainSwap.s.sol \
                    --rpc-url $ETHERLINK_RPC \
                    --private-key $PRIVATE_KEY \
                    --broadcast \
                    --slow \
                    --legacy
                
                # Test on Base Sepolia
                log "Testing on Base Sepolia..."
                forge script script/TestCrosschainSwap.s.sol \
                    --rpc-url $BASE_SEPOLIA_RPC \
                    --private-key $PRIVATE_KEY \
                    --broadcast \
                    --slow
                
                log "🎉 All operations completed!"
                return 0
            else
                log "❌ Base Sepolia deployment failed"
                return 1
            fi
        else
            log "❌ Etherlink deployment failed"
            return 1
        fi
    else
        log "⏳ Insufficient funds. Need 0.02 ETH on each chain."
        return 1
    fi
}

# Main execution
log "🤖 Auto-deployment script started"
log "Monitoring wallet: $WALLET_ADDRESS"
log "Required balance per chain: 0.02 ETH"

# Check once immediately
if check_and_deploy; then
    log "✨ Script completed successfully!"
    exit 0
else
    log "⚠️ Deployment not ready yet. Please send funds to the wallet."
    log "Etherlink Testnet: Send XTZ to $WALLET_ADDRESS"
    log "Base Sepolia: Send ETH to $WALLET_ADDRESS" 
    log "You can run this script again after funding the wallet."
    exit 1
fi