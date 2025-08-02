#!/bin/bash

echo "Running Cross-Chain Swap Test with detailed traces..."
echo "=================================================="

# Run the test with maximum verbosity
forge test --match-test testFullCrossChainSwapFlow -vvvv

echo ""
echo "Running ownership test..."
echo "========================"
forge test --match-test testResolverOwnership -vvv

echo ""
echo "Running relayer authorization test..."
echo "===================================="
forge test --match-test testUnauthorizedRelayerTransfer -vvv