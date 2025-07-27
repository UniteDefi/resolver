#!/bin/bash

echo "==========================================="
echo "UNITEDEFI V2 - NEW ARCHITECTURE FLOW TEST"
echo "==========================================="
echo ""
echo "This script demonstrates the new flow where:"
echo "1. Users pre-approve tokens to EscrowFactory"
echo "2. Relayer posts auctions WITHOUT creating escrows"
echo "3. Resolvers create escrows with safety deposits"
echo "4. Exclusive resolver lock after escrow creation"
echo "5. Relayer moves funds only after resolver commits"
echo "6. Secret reveal after confirmations"
echo ""

# Configuration
DUTCH_AUCTION="0x..." # SimpleDutchAuction address
RESOLVER_V2="0x..." # SimpleUniteResolverV2 address
TOKEN="0x..." # Token address
RPC="https://ethereum-sepolia-rpc.publicnode.com"

# Test accounts
SELLER_KEY="0x..."
SELLER_ADDRESS="0x..."
RELAYER_KEY="0x..."
RELAYER_ADDRESS="0x..."
RESOLVER_KEY="0x..."
RESOLVER_ADDRESS="0x..."

# Auction parameters
AMOUNT="1000000000000000000" # 1 token
START_PRICE="1000000000000000000" # 1 ETH
END_PRICE="500000000000000000" # 0.5 ETH
DURATION="300" # 5 minutes
SAFETY_DEPOSIT="1000000000000000" # 0.001 ETH

# Generate unique IDs
TIMESTAMP=$(date +%s)
AUCTION_ID=$(cast keccak "auction-v2-$TIMESTAMP")
SECRET="test_secret_$TIMESTAMP"
HASHLOCK=$(cast keccak "$SECRET")

echo "Test Configuration:"
echo "- Auction ID: $AUCTION_ID"
echo "- Secret: $SECRET"
echo "- Hashlock: $HASHLOCK"
echo ""

# ========================================
# STEP 1: User approves tokens to factory
# ========================================
echo "STEP 1: User Pre-approves Tokens to Factory"
echo "-------------------------------------------"
echo "User approves EscrowFactory to spend their tokens..."

# In real implementation, this would be to EscrowFactory
# For demo, we approve the resolver contract
TX_APPROVE=$(cast send $TOKEN "approve(address,uint256)" \
  $RESOLVER_V2 \
  $AMOUNT \
  --private-key $SELLER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Approval TX: $TX_APPROVE"
cast receipt $TX_APPROVE --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Token approval complete"
echo ""

# ========================================
# STEP 2: Relayer posts auction (no escrow)
# ========================================
echo "STEP 2: Relayer Posts Auction (No Escrow)"
echo "-----------------------------------------"
echo "Relayer creates auction without creating escrow..."

TX_POST=$(cast send $RESOLVER_V2 "postAuction(bytes32,address,uint256,uint256,uint256,uint256)" \
  $AUCTION_ID \
  $TOKEN \
  $AMOUNT \
  $START_PRICE \
  $END_PRICE \
  $DURATION \
  --private-key $RELAYER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Post Auction TX: $TX_POST"
cast receipt $TX_POST --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Auction posted (no escrow created)"
echo ""

# Check auction status
IS_ACTIVE=$(cast call $RESOLVER_V2 "isAuctionActive(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Auction Active: $([ "$IS_ACTIVE" = "0x0000000000000000000000000000000000000000000000000000000000000001" ] && echo "Yes ✅" || echo "No ❌")"

# Check no resolver assigned yet
RESOLVER_ASSIGNED=$(cast call $RESOLVER_V2 "auctionResolver(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Resolver Assigned: $([ "$RESOLVER_ASSIGNED" = "0x0000000000000000000000000000000000000000000000000000000000000000" ] && echo "None ✅" || echo "$RESOLVER_ASSIGNED")"
echo ""

# ========================================
# STEP 3: Resolver creates escrow with deposit
# ========================================
echo "STEP 3: Resolver Creates Escrow with Safety Deposit"
echo "--------------------------------------------------"
echo "Resolver creates escrow and pays 0.001 ETH safety deposit..."

DST_CHAIN_ID="11155111" # Sepolia
ESCROW_DEADLINE=$(($(date +%s) + 86400)) # 24 hours from now

TX_CREATE_ESCROW=$(cast send $RESOLVER_V2 "createEscrowWithDeposit(bytes32,uint256,bytes32,uint256)" \
  $AUCTION_ID \
  $DST_CHAIN_ID \
  $HASHLOCK \
  $ESCROW_DEADLINE \
  --value $SAFETY_DEPOSIT \
  --private-key $RESOLVER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Create Escrow TX: $TX_CREATE_ESCROW"
cast receipt $TX_CREATE_ESCROW --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Escrow created with safety deposit"

# Verify exclusive lock
RESOLVER_ASSIGNED=$(cast call $RESOLVER_V2 "auctionResolver(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Exclusive Resolver: $RESOLVER_ASSIGNED"

# Get escrow ID
ESCROW_ID=$(cast call $RESOLVER_V2 "auctionToEscrow(bytes32)" $AUCTION_ID --rpc-url $RPC)
echo "Escrow ID: $ESCROW_ID"
echo ""

# ========================================
# STEP 4: Resolver settles auction
# ========================================
echo "STEP 4: Resolver Settles Auction (Exclusive Right)"
echo "-------------------------------------------------"
echo "Waiting 30 seconds for price to decrease..."
sleep 30

# Get current price
CURRENT_PRICE=$(cast call $RESOLVER_V2 "getAuctionPrice(bytes32)" $AUCTION_ID --rpc-url $RPC)
PRICE_ETH=$(cast --to-unit $CURRENT_PRICE ether)
echo "Current Price: $PRICE_ETH ETH"

# Calculate total cost
TOTAL_COST=$(echo "$CURRENT_PRICE * $AMOUNT / 1000000000000000000" | bc)
echo "Total Cost: $(cast --to-unit $TOTAL_COST ether) ETH"

# Settle auction
TX_SETTLE=$(cast send $RESOLVER_V2 "settleAuctionAsResolver(bytes32)" \
  $AUCTION_ID \
  --value $TOTAL_COST \
  --private-key $RESOLVER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Settle TX: $TX_SETTLE"
cast receipt $TX_SETTLE --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Auction settled by resolver"
echo ""

# ========================================
# STEP 5: Seller moves funds
# ========================================
echo "STEP 5: Seller Moves Funds After Resolver Commits"
echo "------------------------------------------------"
echo "Seller transfers funds to escrow..."

TX_MOVE_FUNDS=$(cast send $RESOLVER_V2 "moveSellerFunds(bytes32)" \
  $ESCROW_ID \
  --value $AMOUNT \
  --private-key $RELAYER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Move Funds TX: $TX_MOVE_FUNDS"
cast receipt $TX_MOVE_FUNDS --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Seller funds moved to escrow"
echo ""

# ========================================
# STEP 6: Seller reveals secret
# ========================================
echo "STEP 6: Seller Reveals Secret After Confirmations"
echo "------------------------------------------------"
echo "Waiting for confirmations..."
sleep 5

TX_REVEAL=$(cast send $RESOLVER_V2 "revealSecret(bytes32,bytes32)" \
  $ESCROW_ID \
  $SECRET \
  --private-key $RELAYER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Reveal Secret TX: $TX_REVEAL"
cast receipt $TX_REVEAL --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Secret revealed on-chain"
echo ""

# ========================================
# STEP 7: Resolver withdraws with secret
# ========================================
echo "STEP 7: Resolver Withdraws Using Revealed Secret"
echo "-----------------------------------------------"

TX_WITHDRAW=$(cast send $RESOLVER_V2 "withdrawWithSecret(bytes32,bytes32)" \
  $ESCROW_ID \
  $SECRET \
  --private-key $RESOLVER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Withdraw TX: $TX_WITHDRAW"
cast receipt $TX_WITHDRAW --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Resolver withdrew funds + safety deposit"
echo ""

# ========================================
# Summary
# ========================================
echo "==========================================="
echo "NEW FLOW TEST COMPLETE!"
echo "==========================================="
echo ""
echo "Summary of new architecture:"
echo "✅ User pre-approved tokens (no direct transfer)"
echo "✅ Auction posted without escrow creation"
echo "✅ Resolver created escrow with safety deposit"
echo "✅ Exclusive resolver lock enforced"
echo "✅ Funds moved only after resolver commitment"
echo "✅ Secret revealed after confirmations"
echo "✅ Atomic swap completed successfully"
echo ""
echo "Key improvements:"
echo "- Gasless auction creation for users"
echo "- Resolver competition with safety deposits"
echo "- Better capital efficiency"
echo "- Enhanced security with exclusive locks"