#!/bin/bash

# Deploy SimpleUniteResolver to all testnets
PRIVATE_KEY="0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3"

echo "Deploying SimpleUniteResolver to all testnets..."
echo ""

# Ethereum Sepolia
echo "Deploying to Ethereum Sepolia..."
DUTCH_AUCTION_ETH="0x66AEACCcF67b99E96831f60F821377010aF9B763"
forge create contracts/src/SimpleUniteResolver.sol:SimpleUniteResolver \
  --constructor-args $DUTCH_AUCTION_ETH \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key $PRIVATE_KEY \
  --broadcast

echo ""
echo "Deploying to Base Sepolia..."
DUTCH_AUCTION_BASE="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9"
forge create contracts/src/SimpleUniteResolver.sol:SimpleUniteResolver \
  --constructor-args $DUTCH_AUCTION_BASE \
  --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY \
  --broadcast

echo ""
echo "Deploying to Polygon Amoy..."
DUTCH_AUCTION_POLYGON="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9"
forge create contracts/src/SimpleUniteResolver.sol:SimpleUniteResolver \
  --constructor-args $DUTCH_AUCTION_POLYGON \
  --rpc-url https://rpc-amoy.polygon.technology \
  --private-key $PRIVATE_KEY \
  --legacy \
  --broadcast

echo ""
echo "Deploying to Arbitrum Sepolia..."
DUTCH_AUCTION_ARBITRUM="0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9"
forge create contracts/src/SimpleUniteResolver.sol:SimpleUniteResolver \
  --constructor-args $DUTCH_AUCTION_ARBITRUM \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --private-key $PRIVATE_KEY \
  --broadcast