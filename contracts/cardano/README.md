# Cardano Cross-Chain HTLC Contracts

This directory contains the Cardano implementation of the Unite DeFi cross-chain HTLC system, including mock tokens and all required validators.

## 🎯 Overview

The Cardano contracts enable cross-chain atomic swaps between Cardano and EVM chains through Hash Time Locked Contracts (HTLCs). The system includes:

- **3 Mock Tokens**: USDT, DAI, and Wrapped Native (with fake mint for testing)
- **EscrowFactory**: Deploys and manages escrow contracts
- **Escrow**: Core HTLC logic contract 
- **Resolver**: Manages resolver commitments and earnings
- **LimitOrderProtocol**: Cross-chain limit order management

## 📁 Project Structure

```
cardano/
├── aiken.toml                 # Aiken project configuration
├── lib/                       # Shared libraries
│   ├── unite_types.ak         # Type definitions
│   └── unite_utils.ak         # Utility functions
├── validators/                # Smart contract validators
│   ├── unite_escrow.ak        # HTLC escrow logic
│   ├── unite_factory.ak       # Escrow factory
│   ├── unite_resolver.ak      # Resolver management
│   ├── limit_order_protocol.ak # Limit order system
│   ├── mock_usdt.ak           # Mock USDT token
│   ├── mock_dai.ak            # Mock DAI token
│   └── mock_wrapped_native.ak # Mock wrapped ADA
├── src/                       # TypeScript integration
│   ├── types/cardano.ts       # TypeScript type definitions
│   └── cardano/               # Cardano integration utilities
├── test/                      # Test suite
├── scripts/                   # Deployment scripts
└── deployments.json          # Deployment configuration
```

## 🚀 Quick Start

### Prerequisites

- [Aiken](https://aiken-lang.org/) v1.1.19+
- Node.js 18+
- npm/yarn

### Installation

```bash
# Install dependencies
npm install

# Build contracts (when Aiken environment is ready)
aiken build

# Or use npm script
npm run compile:validators
```

### Testing

```bash
# Run test suite
npm test

# Run specific test
npm run test:crosschain
```

### Deployment

```bash
# Deploy to testnet
npm run deploy:testnet
```

## 🏗️ Smart Contracts

### Mock Tokens

#### MockUSDT (`mock_usdt.ak`)
- **Symbol**: USDT
- **Decimals**: 6
- **Features**: Mint/Burn functionality for testing

#### MockDAI (`mock_dai.ak`) 
- **Symbol**: DAI
- **Decimals**: 18
- **Features**: Mint/Burn functionality for testing

#### MockWrappedNative (`mock_wrapped_native.ak`)
- **Symbol**: WADA
- **Decimals**: 6
- **Features**: 
  - Normal wrap/unwrap (1:1 ADA backing)
  - **FakeMint**: Testing-only function to mint without backing

### Core Validators

#### EscrowFactory (`unite_factory.ak`)
Manages the creation and administration of escrow contracts.

**Redeemers:**
- `CreateEscrow`: Deploy new escrow for an order
- `UpdateAdmin`: Change factory administrator

#### Escrow (`unite_escrow.ak`)
Core HTLC logic handling atomic swaps.

**Redeemers:**
- `WithdrawWithSecret`: Complete swap by revealing secret
- `Cancel`: Cancel and refund after timelock
- `AddResolver`: Add resolver to partial order

#### Resolver (`unite_resolver.ak`)
Manages resolver commitments and earnings tracking.

**Redeemers:**
- `CommitToOrder`: Commit to fulfill part of an order
- `WithdrawEarnings`: Withdraw accumulated fees
- `UpdateCommitment`: Modify commitment amount

#### LimitOrderProtocol (`limit_order_protocol.ak`)
Manages cross-chain limit orders and their execution.

**Redeemers:**
- `CreateOrder`: Create new limit order
- `FillOrder`: Execute order with resolvers
- `CancelOrder`: Cancel unfilled order
- `UpdateOrder`: Modify order parameters

## ⚙️ Configuration

### Timelock Constants
```aiken
src_withdrawal_time = 0        // Immediate with secret
src_cancellation_time = 1800   // 30 minutes
dst_cancellation_time = 2700   // 45 minutes
```

### Fee Structure
```aiken
resolver_fee_basis_points = 10      // 0.1%
safety_deposit_basis_points = 100   // 1%
caller_reward_percentage = 10       // 10%
```

## 🔧 Usage Examples

### Creating an Escrow

```typescript
import { EscrowData, EscrowState } from './src/types/cardano';

const escrowData: EscrowData = {
  orderHash: "order_hash_here",
  hashlock: "secret_hash_here", 
  maker: "maker_address",
  taker: "taker_address",
  resolver: "resolver_address",
  amount: 1000000n, // 1 ADA in lovelace
  isSource: true,
  state: EscrowState.Active
};
```

### Mock Token Minting

```typescript
// Normal mint (USDT/DAI)
const redeemer = {
  type: "Mint",
  amount: 1000000, // 1 USDT (6 decimals)
  recipient: "recipient_address"
};

// Fake mint for wrapped native (testing only)
const fakeRedeemer = {
  type: "FakeMint", 
  amount: 1000000, // 1 WADA
  recipient: "recipient_address"
};
```

## 🧪 Testing

The test suite validates:
- Contract configuration
- Token implementations
- Escrow state management
- Timelock logic
- Fee calculations
- Error handling
- Cross-chain hashlock verification

```bash
# Run all tests
npm test

# Example test output
✅ All required tokens configured
✅ All validators configured  
✅ Hashlock validation works
✅ Timelock logic validation works
```

## 📋 Deployment Status

The contracts are ready for deployment with placeholder configurations. To get actual script hashes:

1. Ensure Aiken environment is properly set up
2. Run `aiken build` to compile contracts
3. Script hashes will be automatically updated in `deployments.json`

## 🔒 Security Considerations

- **Testing Only**: Mock tokens are for testing purposes only
- **FakeMint Warning**: The `FakeMint` function in MockWrappedNative should NEVER be used in production
- **Timelock Safety**: Ensure proper timelock values for cross-chain security
- **Resolver Verification**: Always verify resolver signatures and commitments

## 🚧 Known Issues

- Aiken compilation may hang due to dependency resolution
- Mock tokens have simplified authorization (anyone can mint)
- Some validator helper functions are simplified for MVP

## 📚 References

- [Aiken Documentation](https://aiken-lang.org/language-tour/introduction)
- [Cardano Developer Portal](https://developers.cardano.org/)
- [Lucid Cardano Library](https://lucid.spacebudz.io/)

## 🤝 Contributing

When contributing:
1. Follow Aiken best practices
2. Add comprehensive tests
3. Update type definitions
4. Document new validators
5. Ensure security reviews for production code