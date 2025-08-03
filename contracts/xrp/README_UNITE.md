# Unite Protocol - XRPL Implementation

This implementation adapts the Unite Protocol's EVM contracts for the XRP Ledger (XRPL), enabling cross-chain swaps between EVM chains and XRPL.

## Architecture Overview

### Key Components

1. **XRPLOrderProtocol** - Manages order creation, validation, and tracking
   - Generates deterministic order hashes compatible with EVM
   - Tracks partial fills and nonces
   - Implements Dutch auction pricing

2. **XRPLHTLCFactory** - Creates and manages XRPL Escrows (HTLCs)
   - Creates source and destination escrows
   - Handles partial fills from multiple resolvers
   - Manages escrow fulfillment and cancellation

3. **XRPLUniteResolver** - Resolver interface for cross-chain operations
   - Deploys escrows with partial fill support
   - Implements Dutch auction pricing for destination fills
   - Manages safety deposits and withdrawals

4. **DutchAuctionLib** - Price calculation for linear Dutch auctions
   - Calculates current price based on time
   - Determines taking amounts for given making amounts

## Key Adaptations from EVM

### 1. Order Hash Generation
- Uses same keccak256 hashing as EVM for consistency
- XRPL addresses are deterministically converted to EVM-compatible format
- Ensures same order produces same hash on both chains

### 2. Escrow Implementation
- Uses XRPL's native Escrow feature instead of smart contracts
- Escrows are identified by `creator:sequence` format
- Supports conditional release using SHA256 hashlocks

### 3. Token Handling
- XRP is represented as drops (1 XRP = 1,000,000 drops)
- Prices use 18 decimal precision for EVM compatibility
- Native XRP transfers instead of token contracts

### 4. Partial Fills
- Multiple resolvers can contribute to a single order
- Each resolver creates a separate escrow
- Order tracking ensures total doesn't exceed order amount

## Setup and Usage

### Prerequisites
```bash
npm install
```

### Environment Variables
Create a `.env` file:
```env
XRPL_NETWORK=testnet
XRPL_SERVER_URL=wss://s.altnet.rippletest.net:51233
XRPL_DEPLOYER_SECRET=sXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XRPL_USER_SECRET=sXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XRPL_RESOLVER_SECRET=sXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Quick Start
```bash
# 1. Setup environment (generates wallets & .env)
npm run setup-env

# 2. Fund deployer wallet manually at faucet
# 3. Complete automated deployment
npm run deploy-all

# 4. Run tests (after Base Sepolia deployment)
npm test
```

### Manual Step-by-Step
```bash
# Setup
npm install
npm run setup-env

# Fund deployer: rfWBReUHdZmxrsXhPRmM2DVf77p6jeVAfF
# Faucet: https://xrpl.org/xrp-testnet-faucet.html

# Monitor funding
npm run wait-funding

# Deploy contracts
npm run deploy

# Fund all wallets
FUND_TARGETS="all" FUND_AMOUNT="1000" npm run fund-wallets

# Check status
npm run check-balances
```

## Cross-Chain Swap Flow

### 1. Order Creation (EVM Side)
User creates order on EVM with:
- Making: ERC20 tokens
- Taking: XRP
- Dutch auction parameters

### 2. Source Fill (EVM Side)
Resolvers:
- Lock tokens in EVM escrow
- Provide safety deposits
- Can partially fill orders

### 3. Destination Fill (XRPL Side)
Resolvers:
- Calculate XRP amount using Dutch auction
- Create XRPL escrows with hashlock
- Lock XRP for user

### 4. Withdrawal
- User reveals secret on XRPL
- Claims XRP from escrows
- Resolvers use secret to claim tokens on EVM

## Important Considerations

1. **Decimal Precision**: XRPL uses drops (6 decimals) vs EVM's 18 decimals
2. **Gas vs Reserves**: XRPL requires account reserves instead of gas
3. **Time Precision**: XRPL uses Ripple epoch (946684800 seconds offset)
4. **Account Creation**: XRPL accounts need minimum 10 XRP to exist

## Security Features

- Hashlocked escrows ensure atomic swaps
- Time-based cancellation windows
- Safety deposits protect against griefing
- Partial fill tracking prevents overfilling

## Testing Guidelines

1. Fund deployer wallet first (min 1000 XRP)
2. Run fund-wallets to initialize user and resolver
3. Test partial fills with multiple resolvers
4. Verify Dutch auction pricing over time
5. Test cancellation flows