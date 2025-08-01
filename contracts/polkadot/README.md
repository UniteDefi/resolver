# Polkadot Smart Contracts

This directory contains ink! smart contracts for the Polkadot ecosystem.

## Prerequisites

- Rust with `cargo-contract` installed
- Node.js and Yarn
- A running Substrate node (local or remote)

## Installation

```bash
# Install cargo-contract (if not already installed)
cargo install cargo-contract --force

# Install TypeScript dependencies
yarn install
```

## Project Structure

```
contracts/polkadot/
├── counter/              # ink! counter contract
│   ├── Cargo.toml
│   └── lib.rs
├── tests/               # TypeScript tests
│   └── counter.test.ts
├── scripts/             # Deployment and interaction scripts
│   ├── deploy.ts
│   └── interact.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Building Contracts

```bash
# Compile the counter contract
yarn compile

# Or manually
cd counter && cargo contract build --release
```

## Testing

```bash
# Run all tests
yarn test

# Watch mode
yarn test:watch
```

## Deployment

1. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

2. Deploy to local node:
```bash
yarn deploy:local
```

3. Deploy to testnet:
```bash
yarn deploy:testnet
```

## Interacting with Deployed Contracts

```bash
# Get current counter value
ts-node scripts/interact.ts get

# Increment counter
ts-node scripts/interact.ts increment

# Decrement counter
ts-node scripts/interact.ts decrement

# Get contract owner
ts-node scripts/interact.ts owner
```

## Environment Variables

- `SUBSTRATE_WS_URL`: WebSocket URL for local Substrate node
- `TESTNET_WS_URL`: WebSocket URL for testnet
- `MAINNET_WS_URL`: WebSocket URL for mainnet
- `NETWORK`: Target network (local/testnet/mainnet)
- `DEPLOYER_MNEMONIC`: Mnemonic or derivation path for deployer account
- `INITIAL_COUNTER_VALUE`: Initial value for counter contract

## Contract Features

### Counter Contract
- `new(init_value)`: Constructor with initial value
- `default()`: Constructor with value 0
- `get()`: Get current counter value
- `increment()`: Increment counter by 1
- `decrement()`: Decrement counter by 1 (fails on underflow)
- `get_owner()`: Get contract owner address

Events:
- `Incremented`: Emitted when counter is incremented
- `Decremented`: Emitted when counter is decremented