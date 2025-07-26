#!/bin/bash

# Test script for SimpleDutchAuction deployments
echo "Testing SimpleDutchAuction deployments..."
echo ""

# Load deployment addresses
ETH_ADDRESS="0x66AEACCcF67b99E96831f60F821377010aF9B763"
BASE_ADDRESS="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9"
POLYGON_ADDRESS="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9"
ARBITRUM_ADDRESS="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9"

# Test creating an auction on each chain
AUCTION_ID="0x0000000000000000000000000000000000000000000000000000000000000001"
TOKEN_ADDRESS="0x0000000000000000000000000000000000000000000000000000000000000000"
AMOUNT="1000000000000000000" # 1 token
START_PRICE="1000000000000000000" # 1 ETH
END_PRICE="500000000000000000" # 0.5 ETH
DURATION="3600" # 1 hour

echo "Testing Ethereum Sepolia..."
echo "Contract: $ETH_ADDRESS"
cast call $ETH_ADDRESS "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url https://ethereum-sepolia-rpc.publicnode.com 2>/dev/null && echo "✅ Contract responding" || echo "❌ Contract not responding"

echo ""
echo "Testing Base Sepolia..."
echo "Contract: $BASE_ADDRESS"
cast call $BASE_ADDRESS "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url https://sepolia.base.org 2>/dev/null && echo "✅ Contract responding" || echo "❌ Contract not responding"

echo ""
echo "Testing Polygon Amoy..."
echo "Contract: $POLYGON_ADDRESS"
cast call $POLYGON_ADDRESS "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url https://rpc-amoy.polygon.technology 2>/dev/null && echo "✅ Contract responding" || echo "❌ Contract not responding"

echo ""
echo "Testing Arbitrum Sepolia..."
echo "Contract: $ARBITRUM_ADDRESS"
cast call $ARBITRUM_ADDRESS "getCurrentPrice(bytes32)" $AUCTION_ID --rpc-url https://sepolia-rollup.arbitrum.io/rpc 2>/dev/null && echo "✅ Contract responding" || echo "❌ Contract not responding"

echo ""
echo "Test complete!"