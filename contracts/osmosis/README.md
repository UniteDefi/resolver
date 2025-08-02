# Unite Osmosis Cross-Chain Contracts

This repository contains the Osmosis implementation of Unite's cross-chain swap protocol, enabling seamless swaps between EVM and Cosmos-based chains.

## Architecture

- **UniteOrderProtocol**: Manages cross-chain swap orders with Dutch auction pricing
- **UniteEscrowFactory**: Creates and manages HTLC escrow contracts
- **UniteEscrow**: HTLC implementation with timelock and safety deposit mechanisms
- **UniteResolver**: Facilitates cross-chain swaps for resolvers

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Docker (for local testing)
- CosmWasm 1.5+

### 4-Command Setup

Run these commands from `contracts/osmosis/`:

```bash
# 1. Install dependencies and build contracts
npm install && make build

# 2. Deploy to Osmosis testnet
npm run deploy:testnet

# 3. Setup cross-chain environment
npm run setup:cross-chain

# 4. Run cross-chain tests
npm run test:integration
```

### Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in your mnemonics and RPC URLs
3. Fund your test accounts:
   - Osmosis testnet: https://faucet.testnet.osmosis.zone/
   - Base Sepolia: Use existing faucets

### Testing

```bash
# Unit tests
npm test

# Cross-chain integration tests
npm run test:integration

# With coverage
npm run test:coverage
```

### Local Development

```bash
# Start local Osmosis node
npm run start:local

# Deploy to local node
OSMO_TESTNET_RPC=http://localhost:26657 npm run deploy:testnet

# Stop local node
npm run stop:local
```

## Cross-Chain Flow

1. **Order Creation**: User creates swap order on source chain
2. **Resolver Commitment**: Resolvers deploy escrows with safety deposits
3. **Fund Locking**: Tokens are locked in escrows on both chains
4. **Secret Reveal**: User reveals secret to claim tokens
5. **Settlement**: Resolvers claim their tokens using the revealed secret

## Contract Addresses

After deployment, addresses are saved in `deployments.json`.

## Contributing

1. Install dependencies: `npm install`
2. Build contracts: `make build`
3. Run tests: `npm test`
4. Format code: `npm run format`
5. Lint: `npm run lint`

## License

MIT License - see [LICENSE](LICENSE) file for details.
