#!/bin/bash

echo "==========================================="
echo "UNITEDEFI RELAYER-ORCHESTRATED FLOW DEMO"
echo "==========================================="
echo ""
echo "This script demonstrates the CORRECTED architecture where:"
echo "1. Users approve relayer contract and submit orders"
echo "2. Relayer service broadcasts orders to registered resolvers"
echo "3. Resolvers commit via relayer API with safety deposits"
echo "4. 5-minute execution timer starts after commitment"
echo "5. Resolver deploys escrows on both chains with safety deposits"
echo "6. Relayer transfers user's pre-approved funds to source escrow"
echo "7. Resolver deposits their funds to destination escrow"
echo "8. Relayer reveals secret to complete swap and return deposits"
echo "9. Rescue mechanism available if resolver fails within 5 minutes"
echo ""

# Configuration (would be real deployed addresses)
RELAYER_CONTRACT="0x..." # UniteRelayer address
SRC_TOKEN="0x..." # Source token address
DST_TOKEN="0x..." # Destination token address
RPC="https://ethereum-sepolia-rpc.publicnode.com"

# Test accounts
USER_KEY="0x..."
USER_ADDRESS="0x..."
RESOLVER1_KEY="0x..."
RESOLVER1_ADDRESS="0x..."
RESOLVER2_KEY="0x..." # For rescue scenario
RESOLVER2_ADDRESS="0x..."
RELAYER_OWNER_KEY="0x..."

# Order parameters
SRC_AMOUNT="1000000000000000000000" # 1000 tokens
MIN_DST_AMOUNT="950000000000000000000" # 950 tokens minimum
DST_AMOUNT="1000000000000000000000" # 1000 tokens (what resolver provides)
SAFETY_DEPOSIT="1000000000000000" # 0.001 ETH

# Generated values
SECRET="cross_chain_swap_secret_$(date +%s)"
HASHLOCK=$(cast keccak "$SECRET")
DEADLINE=$(($(date +%s) + 86400)) # 24 hours from now

echo "Configuration:"
echo "- User: $USER_ADDRESS"
echo "- Resolver1: $RESOLVER1_ADDRESS"
echo "- Resolver2: $RESOLVER2_ADDRESS"
echo "- Secret: $SECRET"
echo "- Hashlock: $HASHLOCK"
echo ""

# ========================================
# STEP 1: User approves relayer and submits order
# ========================================
echo "STEP 1: User Approves Relayer and Submits Order"
echo "----------------------------------------------"
echo "User approves relayer contract to spend source tokens..."

# User approves relayer
TX_APPROVE=$(cast send $SRC_TOKEN "approve(address,uint256)" \
  $RELAYER_CONTRACT \
  $SRC_AMOUNT \
  --private-key $USER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Token Approval TX: $TX_APPROVE"
cast receipt $TX_APPROVE --rpc-url $RPC --confirmations 1 > /dev/null

# User submits order to relayer service
echo "User submits cross-chain swap order to relayer..."

TX_SUBMIT=$(cast send $RELAYER_CONTRACT "submitOrder(address,uint256,address,uint256,uint256,uint256,bytes32,uint256)" \
  $SRC_TOKEN \
  $SRC_AMOUNT \
  $DST_TOKEN \
  $MIN_DST_AMOUNT \
  1 \
  2 \
  $HASHLOCK \
  $DEADLINE \
  --private-key $USER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Order Submission TX: $TX_SUBMIT"
cast receipt $TX_SUBMIT --rpc-url $RPC --confirmations 1 > /dev/null

# Get order ID from events (would be 0 for first order)
ORDER_ID="0"
echo "✅ Order submitted with ID: $ORDER_ID"
echo ""

# ========================================
# STEP 2: Relayer broadcasts to resolvers (simulated)
# ========================================
echo "STEP 2: Relayer Service Broadcasts Order to Registered Resolvers"
echo "---------------------------------------------------------------"
echo "Relayer service broadcasts order details to all registered resolvers:"
echo "- Order ID: $ORDER_ID"
echo "- Source: $SRC_AMOUNT tokens on chain 1"
echo "- Destination: $MIN_DST_AMOUNT minimum tokens on chain 2"
echo "- Current market price: [fetched from price oracle]"
echo "- Deadline: $(date -d @$DEADLINE)"
echo ""

# ========================================
# STEP 3: Resolver commits via relayer API
# ========================================
echo "STEP 3: Resolver Commits via Relayer API"
echo "---------------------------------------"
echo "Resolver1 finds the price acceptable and commits..."

TX_COMMIT=$(cast send $RELAYER_CONTRACT "commitToOrder(uint256)" \
  $ORDER_ID \
  --value $SAFETY_DEPOSIT \
  --private-key $RESOLVER1_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Resolver Commitment TX: $TX_COMMIT"
cast receipt $TX_COMMIT --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Resolver committed with 0.001 ETH safety deposit"
echo "⏰ 5-minute execution timer started"
echo ""

# ========================================
# STEP 4: Resolver deploys escrows on both chains
# ========================================
echo "STEP 4: Resolver Deploys Escrows on Both Chains"
echo "----------------------------------------------"
echo "Resolver deploys source escrow on chain 1..."
echo "Resolver deploys destination escrow on chain 2..."
echo "Both escrows include safety deposits..."

# Simulate escrow deployment (would be actual contract deployment)
SRC_ESCROW="0xSourceEscrowAddress$(date +%s | tail -c 10)"
DST_ESCROW="0xDestEscrowAddress$(date +%s | tail -c 10)"

TX_ESCROWS=$(cast send $RELAYER_CONTRACT "notifyEscrowsDeployed(uint256,address,address)" \
  $ORDER_ID \
  $SRC_ESCROW \
  $DST_ESCROW \
  --private-key $RESOLVER1_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Escrow Notification TX: $TX_ESCROWS"
cast receipt $TX_ESCROWS --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Escrows deployed:"
echo "   Source: $SRC_ESCROW"
echo "   Destination: $DST_ESCROW"
echo ""

# ========================================
# STEP 5: Relayer transfers user funds to source escrow
# ========================================
echo "STEP 5: Relayer Transfers User's Pre-approved Funds"
echo "-------------------------------------------------"
echo "Relayer transfers user's tokens to source escrow..."

TX_TRANSFER=$(cast send $RELAYER_CONTRACT "transferUserFunds(uint256)" \
  $ORDER_ID \
  --private-key $RELAYER_OWNER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Fund Transfer TX: $TX_TRANSFER"
cast receipt $TX_TRANSFER --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ User funds transferred to source escrow"
echo ""

# ========================================
# STEP 6: Resolver deposits to destination escrow
# ========================================
echo "STEP 6: Resolver Deposits Funds to Destination Escrow"
echo "----------------------------------------------------"
echo "Resolver deposits their own tokens to destination escrow..."
echo "This ensures user will receive tokens on destination chain..."

# Simulate resolver deposit (would be actual escrow.deposit() call)
echo "Resolver approves destination escrow..."
echo "Resolver calls dstEscrow.deposit()..."
echo "✅ Resolver funds deposited to destination escrow"
echo "✅ Resolver notifies relayer: ready to complete"
echo ""

# ========================================
# STEP 7: Relayer reveals secret to complete swap
# ========================================
echo "STEP 7: Relayer Reveals Secret to Complete Swap"
echo "----------------------------------------------"
echo "All conditions met, relayer reveals the secret..."

TX_REVEAL=$(cast send $RELAYER_CONTRACT "revealSecret(uint256,bytes32)" \
  $ORDER_ID \
  $SECRET \
  --private-key $RELAYER_OWNER_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

echo "Secret Reveal TX: $TX_REVEAL"
cast receipt $TX_REVEAL --rpc-url $RPC --confirmations 1 > /dev/null
echo "✅ Secret revealed on-chain"
echo "✅ Resolver safety deposit returned"
echo "✅ Order marked as completed"
echo ""

# ========================================
# STEP 8: Users and resolver claim their funds
# ========================================
echo "STEP 8: Final Fund Claims"
echo "-----------------------"
echo "User can now withdraw from destination escrow using revealed secret..."
echo "Resolver can withdraw from source escrow using same secret..."
echo ""

echo "Simulating fund withdrawals:"
echo "- User calls dstEscrow.withdraw(secret) → receives destination tokens"
echo "- Resolver calls srcEscrow.withdraw(secret) → receives source tokens"
echo "- Both get their safety deposits back"
echo ""

# ========================================
# Summary
# ========================================
echo "==========================================="
echo "RELAYER-ORCHESTRATED SWAP COMPLETED!"
echo "==========================================="
echo ""
echo "Summary of the corrected architecture:"
echo "✅ User approved relayer and submitted order"
echo "✅ Relayer broadcasted to registered resolvers"
echo "✅ Resolver committed via relayer API (5-min timer)"
echo "✅ Resolver deployed escrows with safety deposits"
echo "✅ Relayer transferred user's pre-approved funds"
echo "✅ Resolver deposited their own funds to dst escrow"
echo "✅ Relayer revealed secret to complete swap"
echo "✅ Both parties can claim their funds atomically"
echo ""
echo "Key advantages of this architecture:"
echo "- Minimal capital requirements for resolvers (only safety deposits)"
echo "- No gas wars (single resolver commitment)"
echo "- Guaranteed order completion via rescue mechanism"
echo "- Coordinated execution through relayer's API"
echo "- Atomic cross-chain swaps with HTLC guarantees"
echo ""

# ========================================
# Bonus: Demonstrate rescue mechanism
# ========================================
echo "BONUS: Rescue Mechanism Demo"
echo "---------------------------"
echo "If Resolver1 had failed to complete within 5 minutes:"
echo "1. Any other resolver can call rescueOrder()"
echo "2. Rescuer pays their own safety deposit"
echo "3. Rescuer gets original resolver's deposit as penalty"
echo "4. Rescuer can then complete the order normally"
echo "5. This ensures orders are always completed"
echo ""
echo "The rescue mechanism prevents orders from being stuck"
echo "and provides economic incentives for completion."