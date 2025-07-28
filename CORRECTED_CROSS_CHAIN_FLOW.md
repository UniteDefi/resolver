# Corrected Cross-Chain Swap Flow Implementation

This document describes the corrected implementation that follows the exact 10-step cross-chain swap flow.

## Architecture Overview

The system implements a **centralized relayer-based cross-chain swap** where:
- **Relayer** orchestrates the entire swap process
- **Resolvers** compete to fulfill orders with minimal capital requirements
- **Users** only need to approve tokens once and submit orders
- **Safety deposits** ensure resolver commitment and enable rescue mechanisms

## 10-Step Flow Implementation

### Step 1: User Token Approval
**Implementation**: Manual step - User calls `token.approve(relayerContract, amount)` on source chain
- **User Action**: Approve RelayerContract to spend source tokens
- **Location**: User's wallet interaction with ERC20 token contract
- **Verification**: Relayer service checks allowance in Step 2

### Step 2: Order Submission  
**Implementation**: `POST /api/create-swap` endpoint in relayer service
- **User Action**: Submit `swapRequest`, `signature`, and `secret` to relayer
- **Relayer Action**: 
  - Register order in RelayerContract via `registerOrder()`
  - Store secret securely
  - Verify user's token approval
- **File**: `relayer/src/routes/swap.routes.ts`

### Step 3: Order Broadcasting
**Implementation**: Automatic broadcast after order creation
- **Relayer Action**: Broadcast order to resolvers with secretHash only (not secret)
- **Broadcast Details**: orderId, chains, tokens, amounts, marketPrice, secretHash, userAddress
- **Access**: Resolvers poll `GET /api/active-orders` endpoint
- **File**: `relayer/src/services/auction.service.ts`

### Step 4: Resolver Commitment
**Implementation**: `POST /api/commit-resolver` endpoint
- **Resolver Action**: Commit to fulfill order at acceptable price
- **Relayer Action**: Start 5-minute execution timer
- **Effect**: Order status changes to "committed"
- **File**: `resolver/services/cross_chain_resolver.ts`

### Step 5: Escrow Deployment
**Implementation**: Resolver deploys escrow contracts with safety deposits
- **Resolver Action**: 
  - Deploy destination escrow using EscrowFactory.createDstEscrow()
  - Deposit safety deposit in native tokens
  - Calculate source escrow address deterministically
- **Pattern**: Follows 1inch cross-chain-swap escrow factory pattern
- **File**: `resolver/services/cross_chain_resolver.ts`

### Step 6: Escrow Verification
**Implementation**: `POST /api/escrows-ready` endpoint
- **Resolver Action**: Notify relayer with escrow addresses and safety deposit transactions
- **Relayer Action**: Verify escrow deployments and safety deposits
- **File**: `relayer/src/routes/swap.routes.ts`

### Step 7: User Fund Transfer
**Implementation**: RelayerContract.transferUserFundsToEscrow()
- **Relayer Action**: Transfer user's pre-approved funds to source escrow via RelayerContract
- **Smart Contract**: RelayerContract calls `transferFrom(user, srcEscrow, amount)`
- **File**: `relayer/src/services/blockchain.service.ts`

### Step 8: Resolver Settlement
**Implementation**: `POST /api/notify-completion` endpoint
- **Resolver Action**: 
  - Deposit destination tokens to destination escrow
  - Notify relayer with transaction hash
- **File**: `resolver/services/cross_chain_resolver.ts`

### Step 9: Secret Revelation
**Implementation**: Relayer reveals secret on destination chain
- **Relayer Action**: 
  - Call destination escrow to reveal secret
  - Unlock funds for user on destination chain
  - Return safety deposit to resolver on destination chain
- **File**: `relayer/src/services/auction.service.ts`

### Step 10: Source Chain Withdrawal
**Implementation**: Resolver uses revealed secret
- **Resolver Action**: Use same secret to withdraw swapped funds and safety deposit from source chain
- **Access**: Secret is now public on destination chain for resolver to read

## Rescue Mechanism

**Timeout Rescue**: If resolver fails within 5-minute window:
1. Order status changes to "rescue_available"
2. Any resolver can commit via `POST /api/rescue-order`
3. Rescue resolver completes trade normally
4. Original resolver forfeits safety deposits as penalty
5. Rescue resolver claims penalty deposits as reward

## Key Corrections Made

### 1. API Flow Separation
- **Before**: Single API call with both swapRequest and secret
- **After**: Proper separation - secret stored securely, only secretHash broadcasted

### 2. RelayerContract Integration
- **Before**: Relayer service didn't use RelayerContract 
- **After**: Order registration and fund transfers via RelayerContract.sol

### 3. Proper Escrow Deployment
- **Before**: Simplified escrow deployment
- **After**: Following 1inch escrow factory pattern with proper immutables structure

### 4. Correct Secret Revelation
- **Before**: Immediate secret revelation
- **After**: Proper HTLC pattern - destination chain first, then source chain access

### 5. Fund Transfer Flow
- **Before**: Direct token transfers
- **After**: RelayerContract.transferUserFundsToEscrow() for Step 7

## Testing

Run the corrected flow test:
```bash
cd resolver/
yarn test:cross-chain-flow
```

The test demonstrates all 10 steps with proper status monitoring and step-by-step logging.

## Files Modified

### Relayer Service
- `src/routes/swap.routes.ts` - Fixed API endpoints for proper flow
- `src/services/auction.service.ts` - Added RelayerContract integration and correct secret revelation
- `src/services/blockchain.service.ts` - Added order registration and proper fund transfer methods

### Resolver Service  
- `services/cross_chain_resolver.ts` - Implemented proper 1inch escrow deployment pattern
- `test_cross_chain_swap_flow.ts` - Updated to match exact 10-step flow

### Smart Contracts
- `contracts/src/RelayerContract.sol` - Already properly implemented for order registration and fund management

## Architecture Benefits

✅ **Minimal Capital Requirements**: Resolvers only need safety deposits, not full trade amounts
✅ **No Gas Wars**: Single resolver commitment prevents competition  
✅ **Guaranteed Execution**: 5-minute timeout with rescue mechanism
✅ **Penalty System**: Failed resolvers forfeit safety deposits
✅ **Atomic Swaps**: HTLC ensures either both sides complete or both revert
✅ **Coordinated Execution**: Relayer orchestrates the entire process

The implementation now correctly follows the exact 10-step flow as specified and matches the proven 1inch cross-chain-swap architecture patterns.