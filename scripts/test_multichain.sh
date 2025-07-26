#!/bin/bash

echo "==========================================="
echo "UNITEDEFI MULTI-CHAIN AUCTION TEST"
echo "==========================================="
echo ""

# Test key
TEST_KEY="0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3"

# Chain configurations
declare -A CHAINS
CHAINS["Ethereum Sepolia"]="0x66AEACCcF67b99E96831f60F821377010aF9B763|https://ethereum-sepolia-rpc.publicnode.com"
CHAINS["Base Sepolia"]="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9|https://sepolia.base.org"
CHAINS["Polygon Amoy"]="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9|https://rpc-amoy.polygon.technology"
CHAINS["Arbitrum Sepolia"]="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9|https://sepolia-rollup.arbitrum.io/rpc"

# Test each chain
for CHAIN in "${!CHAINS[@]}"; do
    IFS='|' read -r CONTRACT RPC <<< "${CHAINS[$CHAIN]}"
    
    echo "Testing $CHAIN"
    echo "------------------------"
    echo "Contract: $CONTRACT"
    
    # Generate unique auction ID
    TIMESTAMP=$(date +%s%N)
    AUCTION_ID=$(cast keccak "$CHAIN-auction-$TIMESTAMP")
    
    # Create auction
    echo -n "Creating auction... "
    TX=$(cast send $CONTRACT "createAuction(bytes32,address,uint256,uint256,uint256,uint256)" \
        $AUCTION_ID \
        0x0000000000000000000000000000000000000000 \
        1000000000000000000 \
        20000000000000000 \
        10000000000000000 \
        60 \
        --private-key $TEST_KEY \
        --rpc-url $RPC \
        $([ "$CHAIN" = "Polygon Amoy" ] && echo "--legacy") \
        --json 2>/dev/null | jq -r '.transactionHash // empty')
    
    if [ -n "$TX" ]; then
        echo "✅ TX: ${TX:0:10}..."
        
        # Check auction
        sleep 2
        IS_ACTIVE=$(cast call $CONTRACT "isAuctionActive(bytes32)" $AUCTION_ID --rpc-url $RPC 2>/dev/null)
        if [ "$IS_ACTIVE" = "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
            echo "✅ Auction is active"
            
            # Get price
            PRICE=$(cast call $CONTRACT "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url $RPC 2>/dev/null)
            PRICE_ETH=$(cast --to-unit $PRICE ether 2>/dev/null || echo "Unknown")
            echo "✅ Current price: $PRICE_ETH ETH"
        else
            echo "❌ Auction not active"
        fi
    else
        echo "❌ Failed to create auction"
    fi
    
    echo ""
done

echo "==========================================="
echo "MULTI-CHAIN TEST COMPLETE"
echo "==========================================="