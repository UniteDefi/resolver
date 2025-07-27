# Relayer Service Architecture

## Overview

This implementation provides a centralized relayer service that orchestrates cross-chain swaps between users and resolvers. The architecture eliminates on-chain auctions in favor of API-based resolver selection.

## Key Components

### 1. RelayerService Contract
- Centralized orchestrator for all swaps
- Manages order lifecycle and resolver commitments
- Enforces 5-minute execution windows
- Handles rescue mechanism for failed swaps

### 2. UniteResolverV2 Contract
- Resolver interface without auction mechanism
- Creates escrows on both chains with safety deposits
- Notifies relayer service of escrow creation
- Enables resolver withdrawals using revealed secrets

### 3. EnhancedEscrowFactory Contract
- Manages user pre-approvals for gasless operations
- Tracks safety deposits and forfeitures
- Supports rescue mechanism for failed resolvers
- Moves user funds only after resolver commitment

## Swap Flow

### Normal Flow (Etherlink → Base Sepolia)

1. **User Preparation**
   - User approves tokens to EscrowFactory
   - User calls `preApproveToken()` to enable gasless transfers

2. **Order Creation**
   - Relayer creates order via `createOrder()`
   - Broadcasts order to resolvers off-chain with market price

3. **Resolver Commitment**
   - Single resolver commits via API
   - Relayer records commitment with `commitToOrder()`
   - 5-minute execution window starts

4. **Escrow Creation**
   - Resolver deploys escrows on both chains
   - Deposits safety deposits (0.001 ETH each chain)
   - Deposits swap amounts in respective escrows
   - Calls `createEscrowsForOrder()` with safety deposits

5. **Fund Movement**
   - Relayer automatically moves user's pre-approved funds
   - Funds transferred to source escrow via `notifyEscrowsCreated()`

6. **Completion**
   - Relayer reveals secret on destination chain
   - User claims funds on destination
   - Resolver uses secret to withdraw on source chain
   - Safety deposits returned to resolver

### Rescue Flow (Failed Resolver)

1. **Timeout Detection**
   - Original resolver fails to complete within 5 minutes
   - Execution window expires

2. **Rescue Initiation**
   - New resolver calls `rescueOrder()`
   - Gets assigned as new committed resolver
   - New 5-minute window starts

3. **Rescue Completion**
   - Rescue resolver creates escrows
   - Completes the swap normally
   - Claims original resolver's forfeited safety deposits

## Safety Mechanisms

- **Pre-approvals**: Users pre-approve tokens to avoid gas costs during swaps
- **Safety Deposits**: 10% of order value required from resolvers
- **Execution Windows**: 5-minute timeout prevents indefinite locks
- **Rescue Mechanism**: Any resolver can rescue failed swaps
- **Single Assignment**: Only one resolver can work on an order at a time

## Test Coverage

The implementation includes comprehensive tests for:
- Etherlink → Base Sepolia swaps
- Base Sepolia → Etherlink swaps
- Rescue mechanisms
- Multiple concurrent orders
- Edge cases and error conditions
- Network delay scenarios
- Partial amount swaps

## Security Considerations

1. **Authorized Relayers**: Only authorized relayer can orchestrate swaps
2. **Resolver Authorization**: Only authorized resolvers can participate
3. **Reentrancy Protection**: Critical functions protected against reentrancy
4. **Time-based Security**: Execution windows prevent indefinite locks
5. **Safety Deposit Forfeiture**: Economic incentive for resolver completion