# Unite Protocol - TON Contracts

This directory contains the TON blockchain implementation of the Unite Protocol contracts.

## 📋 Contracts Overview

### Core Contracts

1. **MockUSDT** (`mock_usdt.fc`)
   - Test USDT token implementation
   - Standard Jetton with mint functionality for testing
   - Anyone can mint tokens (testing only)

2. **MockDAI** (`mock_dai.fc`)
   - Test DAI token implementation  
   - Standard Jetton with mint functionality for testing
   - Anyone can mint tokens (testing only)

3. **MockWrappedNative** (`mock_wrapped_native.fc`)
   - Wrapped TON token for testing
   - Includes fake mint function for testing purposes
   - Supports wrap/unwrap functionality (simplified)

4. **UniteEscrowFactory** (`unite_escrow_factory.fc`)
   - Factory contract for deploying escrow contracts
   - Handles both source and destination escrow creation
   - Tracks resolver participation and total filled amounts

5. **UniteEscrow** (`unite_escrow.fc`)
   - Core escrow logic for cross-chain swaps
   - Handles resolver deposits and fund distribution
   - Supports both source and destination chain operations
   - Secret-based withdrawal mechanism

6. **UniteResolver** (`unite_resolver.fc`)
   - Cross-chain transaction coordination
   - Order registration and validation
   - Resolver staking and dispute resolution
   - Proof submission and verification

7. **UniteLimitOrderProtocol** (`unite_limit_order_protocol.fc`)
   - Limit order creation and matching
   - Order book management
   - Fee collection and distribution
   - Market/limit/stop order types

## 🏗️ Architecture

The Unite Protocol on TON consists of several interconnected contracts:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MockTokens    │    │ EscrowFactory   │    │   Resolver      │
│ (USDT/DAI/WTON) │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐    ┌─────────────────┐
                    │     Escrow      │    │ LimitOrderProt. │
                    │                 │    │                 │
                    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Building

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm run test tests/utils.spec.ts
```

### Deployment

```bash
# Deploy to testnet
npm run deploy

# Deploy with specific network
npm run deploy:testnet
```

## 📁 Project Structure

```
contracts/ton/
├── contracts/           # FunC smart contracts
│   ├── imports/        # Shared utilities and constants
│   ├── mock_*.fc       # Test token contracts
│   ├── unite_*.fc      # Core protocol contracts
├── scripts/            # Deployment and utility scripts
├── tests/              # Test suites
├── utils/              # TypeScript utilities
├── wrappers/           # Contract wrappers for TypeScript
└── README.md
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
TONCENTER_API_KEY=your_api_key_here
TON_NETWORK=testnet
BASE_SEPOLIA_RPC_URL=your_evm_rpc_url
```

### Network Configuration

The contracts are configured for TON testnet by default. See `blueprint.config.ts` for network settings.

## 📝 Contract Details

### Token Contracts

All mock tokens implement the standard TON Jetton interface with additional minting capabilities for testing:

- **Total Supply**: Unlimited (for testing)
- **Decimals**: 9 (standard for TON)
- **Admin Functions**: Change admin, change content
- **Test Functions**: Public minting

### Escrow System

The escrow system uses a factory pattern:

1. **EscrowFactory** deploys individual escrow contracts
2. **Escrow** contracts handle the actual fund locking and release
3. **Resolver** contracts coordinate cross-chain operations

### Order Protocol

The limit order protocol supports:

- Market orders (immediate execution)
- Limit orders (price-conditional)
- Stop orders (trigger-based)
- Partial fills and cancellations

## 🧪 Testing

The test suite includes:

- Unit tests for utility functions
- Integration tests for contract interactions
- Cross-chain simulation tests

```bash
# Run specific test categories
npm run test:crosschain  # Cross-chain integration tests
npm run test tests/utils.spec.ts  # Utility function tests
```

## 🚀 Deployment Guide

### Local Development

1. Install dependencies: `npm install`
2. Build contracts: `npm run build`
3. Run tests: `npm test`
4. Deploy locally: `npm run deploy:local`

### Testnet Deployment

1. Configure testnet in `.env`
2. Fund your wallet with test TON
3. Deploy: `npm run deploy:testnet`

### Production Deployment

⚠️ **Production deployment requires proper security review and real TON funds**

1. Configure mainnet settings
2. Ensure wallet security
3. Deploy: `npm run deploy:mainnet`

## 📚 Additional Resources

- [TON Documentation](https://docs.ton.org/)
- [FunC Language Reference](https://docs.ton.org/develop/func/overview)
- [TON Jetton Standard](https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md)

## ⚠️ Security Notes

- Mock tokens are for testing only
- Fake mint functions should not be used in production
- All contracts need security auditing before mainnet deployment
- Proper access controls should be implemented for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality  
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details