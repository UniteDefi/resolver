#!/bin/bash

# Example interaction with SimpleDutchAuction on Ethereum Sepolia
CONTRACT="0x66AEACCcF67b99E96831f60F821377010aF9B763"
RPC="https://ethereum-sepolia-rpc.publicnode.com"
PRIVATE_KEY="0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3"

echo "SimpleDutchAuction Interaction Example"
echo "======================================"
echo ""

# Create a test auction
AUCTION_ID="0x0000000000000000000000000000000000000000000000000000000000000001"
TOKEN="0x0000000000000000000000000000000000000000000000000000000000000000" # Using zero address for testing
AMOUNT="1000000000000000000" # 1 token
START_PRICE="1000000000000000000" # 1 ETH
END_PRICE="500000000000000000" # 0.5 ETH  
DURATION="3600" # 1 hour

echo "Creating auction..."
echo "Auction ID: $AUCTION_ID"
echo "Token: $TOKEN"
echo "Amount: 1 token"
echo "Start Price: 1 ETH"
echo "End Price: 0.5 ETH"
echo "Duration: 1 hour"
echo ""

# Create auction
cast send $CONTRACT "createAuction(bytes32,address,uint256,uint256,uint256,uint256)" \
  $AUCTION_ID \
  $TOKEN \
  $AMOUNT \
  $START_PRICE \
  $END_PRICE \
  $DURATION \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC

echo ""
echo "Checking auction status..."
IS_ACTIVE=$(cast call $CONTRACT "isAuctionActive(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Is Active: $IS_ACTIVE"

echo ""
echo "Getting current price..."
CURRENT_PRICE=$(cast call $CONTRACT "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Current Price: $CURRENT_PRICE"

echo ""
echo "To settle the auction, run:"
echo "cast send $CONTRACT \"settleAuction(bytes32)\" $AUCTION_ID --value <payment_amount> --private-key <buyer_key> --rpc-url $RPC"