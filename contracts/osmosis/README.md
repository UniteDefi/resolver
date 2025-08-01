# Osmosis CosmWasm Contracts

This directory contains CosmWasm smart contracts for the Osmosis blockchain.

## Structure

```
contracts/osmosis/
├── contracts/          # Rust smart contracts
│   └── counter/       # Example counter contract
├── tests/             # TypeScript integration tests
├── scripts/           # Deployment and utility scripts
└── artifacts/         # Build outputs and deployment info
```

## Prerequisites

- Rust with `wasm32-unknown-unknown` target
- Node.js and Yarn
- osmosisd CLI (for CLI deployment)
- LocalOsmosis or access to Osmosis testnet

## Setup

1. Install Rust dependencies:
```bash
rustup target add wasm32-unknown-unknown
cargo install cargo-generate --features vendored-openssl
```

2. Install Node dependencies:
```bash
cd contracts/osmosis
yarn install
```

3. Copy environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Building

Build the counter contract:
```bash
cd contracts/counter
cargo wasm
```

Optimize for production:
```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.15.0
```

## Testing

Run TypeScript integration tests:
```bash
yarn test
```

## Deployment

### Using TypeScript (recommended for development)

Deploy to local network:
```bash
yarn deploy:local
```

Deploy to testnet:
```bash
yarn deploy:testnet
```

### Using osmosisd CLI

```bash
./scripts/deploy_cli.sh
```

## Contract Interaction

### Query count:
```bash
osmosisd query wasm contract-state smart [CONTRACT_ADDRESS] '{"get_count":{}}'
```

### Increment:
```bash
osmosisd tx wasm execute [CONTRACT_ADDRESS] '{"increment":{}}' --from [KEY_NAME]
```

### Decrement:
```bash
osmosisd tx wasm execute [CONTRACT_ADDRESS] '{"decrement":{}}' --from [KEY_NAME]
```

## Environment Variables

See `.env.example` for all available configuration options:

- `RPC_ENDPOINT`: Local/custom RPC endpoint
- `MNEMONIC`: Wallet mnemonic for local development
- `TESTNET_RPC_ENDPOINT`: Osmosis testnet RPC
- `TESTNET_MNEMONIC`: Testnet wallet mnemonic
- `INITIAL_COUNT`: Initial counter value
- `CHAIN_ID`: Osmosis chain ID
- `KEY_NAME`: Key name in osmosisd keyring

## Resources

- [Osmosis Docs](https://docs.osmosis.zone/)
- [CosmWasm Docs](https://docs.cosmwasm.com/)
- [Osmosis Testnet Faucet](https://faucet.testnet.osmosis.zone/)