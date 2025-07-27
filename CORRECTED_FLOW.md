# Cross-Chain Swap Architecture - Corrected Flow

This document describes the corrected flow for the cross-chain swap system with a centralized relayer service orchestrating swaps between users and resolvers.

## Overview

The system enables trustless cross-chain token swaps through a relayer-coordinated process that minimizes resolver capital requirements while ensuring order completion.

## Key Components

1. **User**: Initiates swaps and approves the relayer contract
2. **Relayer Service**: Central coordinator that manages orders and secrets
3. **Resolver**: Market makers that fulfill orders for profit
4. **Escrow Contracts**: Hold funds securely during the swap process

## Detailed Flow

### 1. User Preparation
- User approves the relayer contract to spend their source tokens
- This is a one-time approval per token (or per swap amount)

### 2. Order Creation
- User submits swap request to relayer service with:
  - Source/destination chains and tokens
  - Amount to swap
  - Secret hash for HTLC
  - Minimum acceptable price
- Relayer validates user has sufficient approved tokens
- Relayer broadcasts order to all resolvers with current market price

### 3. Resolver Commitment (5-minute window starts)
- Resolvers monitor order broadcasts
- When profitable, resolver commits through relayer API
- Only one resolver can commit per order
- 5-minute execution timer begins

### 4. Escrow Deployment
- Committed resolver deploys escrow contracts on both chains
- Resolver deposits safety deposits (10% of order value) to both escrows
- Notifies relayer when escrows are ready

### 5. Fund Movement
- Relayer transfers user's pre-approved funds to source escrow
- Resolver deposits destination tokens to destination escrow
- Both transfers must complete within the 5-minute window

### 6. Secret Revelation
- Resolver notifies relayer of completion
- Relayer waits for blockchain confirmations
- Relayer reveals secret on destination chain
- This unlocks:
  - Destination tokens for the user
  - Safety deposit return for the resolver

### 7. Completion
- Resolver uses revealed secret to withdraw from source escrow
- Resolver receives:
  - Swapped source tokens
  - Return of safety deposit

### 8. Rescue Mechanism
- If resolver fails within 5-minute window:
  - Order becomes "rescue_available"
  - Any resolver can complete the swap
  - Rescuer claims original resolver's safety deposits as reward

## Implementation Details

### Relayer Contract
```solidity
contract Relayer {
    // Holds user approvals
    // Transfers pre-approved funds to escrows
    function transferUserFunds(user, token, amount, escrow) onlyAuthorized
}
```

### Order States
- `active`: Open for resolver commitment
- `committed`: Resolver committed, 5-min timer active
- `settling`: Funds being moved
- `completed`: Swap successful
- `failed`: Swap failed
- `rescue_available`: Failed resolver, open for rescue

### API Endpoints

**Relayer Service:**
- `POST /api/create-swap`: Create new order
- `POST /api/commit-resolver`: Resolver commits
- `POST /api/escrows-ready`: Notify escrows deployed
- `POST /api/notify-completion`: Notify settlement done
- `GET /api/order-status/:id`: Check order status
- `GET /api/active-orders`: List available orders

### Key Benefits

1. **Minimal Resolver Capital**: Only safety deposits required
2. **No Gas Wars**: Single resolver commitment
3. **Guaranteed Completion**: Rescue mechanism ensures orders complete
4. **Coordinated Execution**: Relayer manages complex cross-chain flow
5. **User Simplicity**: One approval, then hands-off

## Testing

Run the complete system test:
```bash
# Deploy mock relayer contracts
npm run deploy:mock-relayer

# Run integrated test
npm run test:complete-system
```

The test will:
1. Start relayer and resolver services
2. Deploy necessary contracts
3. Execute a real cross-chain swap
4. Verify successful completion

## Configuration

### Environment Variables
```env
# User
USER_PRIVATE_KEY=your_test_user_key

# Relayer Service
RELAYER_PRIVATE_KEY=relayer_service_key
RELAYER_WALLET_ADDRESS=relayer_service_address

# Resolver
RESOLVER1_WALLET_PRIVATE_KEY=resolver_key

# Infrastructure
ALCHEMY_API_KEY=your_alchemy_key
```

### Supported Chains
- Base Sepolia (chainId: 84532)
- Arbitrum Sepolia (chainId: 421614)
- Ethereum Sepolia (chainId: 11155111)
- Polygon Amoy (chainId: 80002)