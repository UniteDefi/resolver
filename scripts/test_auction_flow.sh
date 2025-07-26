#!/bin/bash

# Test complete auction flow on Ethereum Sepolia
CONTRACT="0x66AEACCcF67b99E96831f60F821377010aF9B763"
RPC="https://ethereum-sepolia-rpc.publicnode.com"

# Test accounts
SELLER_KEY="0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3"
SELLER_ADDRESS="0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35"

# Generate a unique auction ID based on timestamp
TIMESTAMP=$(date +%s)
AUCTION_ID=$(cast keccak "auction-$TIMESTAMP")

echo "==========================================="
echo "UNITEDEFI DUTCH AUCTION FLOW TEST"
echo "==========================================="
echo ""
echo "Contract: $CONTRACT"
echo "Network: Ethereum Sepolia"
echo "Seller: $SELLER_ADDRESS"
echo ""

# Auction parameters
TOKEN="0x0000000000000000000000000000000000000000" # Zero address for testing
AMOUNT="1000000000000000000" # 1 token
START_PRICE="100000000000000000" # 0.1 ETH
END_PRICE="50000000000000000"   # 0.05 ETH
DURATION="300" # 5 minutes

echo "Creating Dutch Auction..."
echo "- Auction ID: $AUCTION_ID"
echo "- Amount: 1 token"
echo "- Start Price: 0.1 ETH"
echo "- End Price: 0.05 ETH"
echo "- Duration: 5 minutes"
echo ""

# Create auction
echo "Sending transaction..."
TX_HASH=$(cast send $CONTRACT "createAuction(bytes32,address,uint256,uint256,uint256,uint256)" \
  $AUCTION_ID \
  $TOKEN \
  $AMOUNT \
  $START_PRICE \
  $END_PRICE \
  $DURATION \
  --private-key $SELLER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Transaction: $TX_HASH"
echo "Waiting for confirmation..."
cast receipt $TX_HASH --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Auction created!"
echo ""

# Check auction status
echo "Verifying auction..."
IS_ACTIVE=$(cast call $CONTRACT "isAuctionActive(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Is Active: $([ "$IS_ACTIVE" = "0x0000000000000000000000000000000000000000000000000000000000000001" ] && echo "Yes" || echo "No")"

# Get current price
CURRENT_PRICE=$(cast call $CONTRACT "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url $RPC)
PRICE_ETH=$(cast --to-unit $CURRENT_PRICE ether)
echo "Current Price: $PRICE_ETH ETH"
echo ""

# Get auction details
echo "Fetching auction details..."
AUCTION_DATA=$(cast call $CONTRACT "auctions(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Raw auction data retrieved"
echo ""

# Simulate price over time
echo "Price simulation over 5 minutes:"
for i in 0 60 120 180 240 300; do
  if [ $i -eq 0 ]; then
    echo "  - At start (now): 0.1 ETH"
  elif [ $i -eq 300 ]; then
    echo "  - After 5 min: 0.05 ETH"
  else
    PRICE_AT_TIME=$((100000000000000000 - (50000000000000000 * i / 300)))
    PRICE_ETH_AT_TIME=$(cast --to-unit $PRICE_AT_TIME ether)
    echo "  - After $i sec: $PRICE_ETH_AT_TIME ETH"
  fi
done
echo ""

# Settlement instructions
echo "To settle this auction:"
echo "1. Anyone can buy by sending the current price amount"
echo "2. Use this command (replace BUYER_KEY):"
echo ""
echo "BUYER_KEY=<your-private-key>"
echo "PAYMENT=\$(cast call $CONTRACT \"getCurrentPrice(bytes32)\" $AUCTION_ID --rpc-url $RPC)"
echo "cast send $CONTRACT \"settleAuction(bytes32)\" $AUCTION_ID --value \$PAYMENT --private-key \$BUYER_KEY --rpc-url $RPC"
echo ""

# Cancel option
echo "To cancel this auction (only seller):"
echo "cast send $CONTRACT \"cancelAuction(bytes32)\" $AUCTION_ID --private-key $SELLER_KEY --rpc-url $RPC"
echo ""

echo "==========================================="
echo "TEST COMPLETE"
echo "==========================================="