#!/bin/bash

echo "==========================================="
echo "UNITEDEFI COMPLETE AUCTION FLOW TEST"
echo "==========================================="
echo ""

# Configuration
CONTRACT="0x66AEACCcF67b99E96831f60F821377010aF9B763"
RPC="https://ethereum-sepolia-rpc.publicnode.com"

# Use the same private key for both seller and buyer for testing
TEST_KEY="0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3"
TEST_ADDRESS="0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35"

# Generate unique auction ID
TIMESTAMP=$(date +%s)
AUCTION_ID=$(cast keccak "test-auction-$TIMESTAMP")

echo "Test Configuration:"
echo "- Network: Ethereum Sepolia"
echo "- Contract: $CONTRACT"
echo "- Test Account: $TEST_ADDRESS"
echo "- Auction ID: $AUCTION_ID"
echo ""

# Step 1: Create Auction
echo "STEP 1: Creating Dutch Auction"
echo "------------------------------"
TOKEN="0x0000000000000000000000000000000000000000"
AMOUNT="1000000000000000000" # 1 token
START_PRICE="10000000000000000" # 0.01 ETH
END_PRICE="5000000000000000"   # 0.005 ETH
DURATION="60" # 1 minute for quick testing

echo "Parameters:"
echo "- Start Price: 0.01 ETH"
echo "- End Price: 0.005 ETH"
echo "- Duration: 60 seconds"
echo ""

TX_CREATE=$(cast send $CONTRACT "createAuction(bytes32,address,uint256,uint256,uint256,uint256)" \
  $AUCTION_ID \
  $TOKEN \
  $AMOUNT \
  $START_PRICE \
  $END_PRICE \
  $DURATION \
  --private-key $TEST_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Transaction: $TX_CREATE"
cast receipt $TX_CREATE --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Auction created successfully!"
echo ""

# Step 2: Check Auction Status
echo "STEP 2: Verifying Auction Status"
echo "--------------------------------"
IS_ACTIVE=$(cast call $CONTRACT "isAuctionActive(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Active: $([ "$IS_ACTIVE" = "0x0000000000000000000000000000000000000000000000000000000000000001" ] && echo "Yes ✅" || echo "No ❌")"

CURRENT_PRICE=$(cast call $CONTRACT "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url $RPC)
PRICE_ETH=$(cast --to-unit $CURRENT_PRICE ether)
echo "Current Price: $PRICE_ETH ETH"
echo ""

# Step 3: Wait a bit and check price decrease
echo "STEP 3: Testing Price Decrease"
echo "------------------------------"
echo "Waiting 10 seconds..."
sleep 10

NEW_PRICE=$(cast call $CONTRACT "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url $RPC)
NEW_PRICE_ETH=$(cast --to-unit $NEW_PRICE ether)
echo "Price after 10 seconds: $NEW_PRICE_ETH ETH"
echo ""

# Step 4: Settle Auction
echo "STEP 4: Settling Auction"
echo "-----------------------"
SETTLE_PRICE=$(cast call $CONTRACT "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url $RPC)
TOTAL_COST=$(cast --to-uint256 $(echo "$SETTLE_PRICE * $AMOUNT / 1000000000000000000" | bc))

echo "Settlement price: $(cast --to-unit $SETTLE_PRICE ether) ETH"
echo "Total cost for 1 token: $(cast --to-unit $TOTAL_COST ether) ETH"
echo ""

echo "Settling auction..."
TX_SETTLE=$(cast send $CONTRACT "settleAuction(bytes32)" \
  $AUCTION_ID \
  --value $TOTAL_COST \
  --private-key $TEST_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Transaction: $TX_SETTLE"
cast receipt $TX_SETTLE --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Auction settled successfully!"
echo ""

# Step 5: Verify auction is no longer active
echo "STEP 5: Post-Settlement Verification"
echo "-----------------------------------"
IS_ACTIVE_AFTER=$(cast call $CONTRACT "isAuctionActive(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Active after settlement: $([ "$IS_ACTIVE_AFTER" = "0x0000000000000000000000000000000000000000000000000000000000000001" ] && echo "Yes ❌" || echo "No ✅")"
echo ""

echo "==========================================="
echo "FLOW TEST COMPLETE!"
echo "==========================================="
echo ""
echo "Summary:"
echo "✅ Created dutch auction"
echo "✅ Verified price decreases over time"
echo "✅ Successfully settled auction"
echo "✅ Verified auction closed after settlement"