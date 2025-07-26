# UniteDefi Cross-Chain Resolver

A comprehensive implementation of Dutch auction resolvers with cross-chain capabilities, built on top of 1inch Fusion+ infrastructure.

## Project Structure

```
resolver/
├── contracts/           # Solidity smart contracts
│   ├── src/            # Contract implementations
│   └── test/           # Foundry tests
├── services/           # TypeScript resolver services
│   ├── common/         # Shared utilities
│   ├── resolvers/      # Resolver implementations
│   └── seller/         # Auction creator service
├── tests/              # Integration tests
├── scripts/            # Deployment and utility scripts
└── docs/               # Documentation
```

## Features

- **Dutch Auction Mechanism**: Linear price decrease from start to end price
- **Multi-Chain Support**: Deployed on Ethereum, Base, Polygon, and Arbitrum testnets
- **Competitive Resolvers**: Multiple resolver strategies competing for best prices
- **Cross-Chain Integration**: HTLC-based atomic swaps for secure cross-chain transfers
- **Comprehensive Testing**: Unit tests, integration tests, and edge case coverage

## Quick Start

### Prerequisites

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Install [Foundry](https://book.getfoundry.sh/getting-started/installation):
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   ```

3. Install contract dependencies:
   ```bash
   forge install
   ```

### Running Resolver Services

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Run resolver competition (single chain):
   ```bash
   pnpm start:single-chain
   ```

3. Run multi-chain competition:
   ```bash
   pnpm start:multi-chain
   ```

4. Run edge case tests:
   ```bash
   pnpm start:edge-cases
   ```

### Running Tests

1. Foundry tests:
   ```bash
   forge test
   ```

2. Integration tests:
   ```bash
   SRC_CHAIN_RPC=<ETH_RPC> DST_CHAIN_RPC=<BSC_RPC> pnpm test
   ```

## Deployed Contracts

### SimpleDutchAuction
- Ethereum Sepolia: `0x66AEACCcF67b99E96831f60F821377010aF9B763`
- Base Sepolia: `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9`
- Polygon Amoy: `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9`
- Arbitrum Sepolia: `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9`

## Architecture Overview

### Smart Contracts

1. **SimpleDutchAuction.sol**: Standalone Dutch auction implementation
2. **SimpleUniteResolver.sol**: Integrates Dutch auction with escrow capabilities
3. **UniteResolver.sol**: Full integration with 1inch Fusion+ protocol
4. **Resolver.sol**: Base resolver from 1inch for cross-chain swaps

### Resolver Services

1. **Base Resolver**: Core functionality for monitoring and settling auctions
2. **Fast Resolver**: Minimal delay, attempts to be first
3. **Patient Resolver**: Waits for 50% price drop before attempting
4. **Balanced Resolver**: Moderate approach with balanced timing
5. **Random Resolver**: Unpredictable behavior for testing

### Flow

1. Seller creates Dutch auction with decreasing price
2. Multiple resolvers monitor for new auctions
3. Resolvers evaluate prices based on their strategies
4. First resolver to successfully settle wins the auction
5. For cross-chain orders, HTLC ensures atomic completion

## Development

### Building Contracts
```bash
forge build
```

### Running Local Services
```bash
pnpm build
pnpm start:resolvers
```

### Adding New Chains
Update `services/common/config.ts` with new chain configuration.

## Test Accounts

When using test mnemonic:
- Account 0: Seller
- Account 1-4: Resolvers

## Documentation

- [Services Documentation](./services/README.md) - Detailed resolver service guide
- [Test Results](./docs/TEST_RESULTS.md) - Deployment and testing outcomes
- [Project Overview](./docs/UNITE_README.md) - Full project documentation

## License

MIT