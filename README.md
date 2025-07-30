# Unite DeFi Resolver

A multi-blockchain cross-chain swap resolver service that enables seamless asset transfers across EVM and non-EVM chains using HTLC (Hash Time-Locked Contracts) and Dutch auction mechanisms.

## Overview

Unite DeFi Resolver consists of:
- **Smart Contracts**: Deployed across multiple blockchains (EVM, Aptos, Sui, Near, Tron)
- **Resolver Service**: Node.js service that monitors and executes cross-chain swaps
- **Testing Suite**: Comprehensive testing utilities for development and debugging

## Project Structure

```
resolver/
├── contracts/          # Smart contracts for different blockchains
│   ├── evm/           # Ethereum-compatible contracts (Solidity)
│   ├── aptos/         # Aptos contracts (Move)
│   ├── sui/           # Sui contracts (Move)
│   ├── near/          # Near contracts (Rust)
│   └── tron/          # Tron contracts (Solidity)
├── service/           # Resolver service implementation
│   ├── enhanced_sqs_resolver.ts  # Main resolver service
│   ├── common/        # Shared utilities and configurations
│   └── resolvers/     # Different resolver strategies
├── testing/           # Test scripts and utilities
│   └── constants/     # Chain-specific test constants
└── deployments.json   # Unified deployment addresses
```

## Quick Start

### Prerequisites

- Node.js v18+
- Yarn package manager
- AWS credentials (for SQS integration)
- RPC endpoints for target chains

### Installation

```bash
# Clone the repository
git clone https://github.com/UniteDefi/resolver.git
cd resolver

# Install service dependencies
cd service
yarn install
```

### Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Configure your environment variables:
```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/your-account/resolver-queue

# Resolver Configuration
RESOLVER_PRIVATE_KEY=your_resolver_private_key
RELAYER_URL=https://api.unite.defi/relayer

# Chain RPC URLs
ETHEREUM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
BASE_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your-key
ARBITRUM_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/your-key
```

### Running the Resolver

```bash
cd service
yarn start:enhanced-resolver
```

## Architecture

The resolver service operates as follows:

1. **Order Discovery**: Monitors SQS queue for new cross-chain swap orders
2. **Validation**: Validates order parameters and checks profitability
3. **Execution**: Commits to orders by calling smart contracts
4. **Settlement**: Monitors and completes HTLC settlements

For detailed architecture information, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Supported Chains

### EVM Chains
- Ethereum (Mainnet, Sepolia)
- Base (Mainnet, Sepolia)
- Arbitrum (Mainnet, Sepolia)
- Monad (Testnet)

### Non-EVM Chains
- Aptos (Testnet)
- Sui (Testnet)
- Near (Testnet)
- Tron (Shasta Testnet)

## Development

### Building Contracts

#### EVM Contracts
```bash
cd contracts/evm
forge build
```

#### Aptos Contracts
```bash
cd contracts/aptos
aptos move compile
```

#### Sui Contracts
```bash
cd contracts/sui
sui move build
```

### Testing

```bash
cd service
yarn test
```

### Adding a New Chain

1. Add contract implementations in `contracts/<chain-name>/`
2. Update `deployments.json` with deployment addresses
3. Add chain configuration in `service/common/config.ts`
4. Implement chain-specific logic if needed

## Contributing

Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details