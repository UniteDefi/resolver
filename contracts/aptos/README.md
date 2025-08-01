# Aptos Counter Contract

A simple counter contract demonstrating Move development on Aptos with TypeScript integration.

## Prerequisites

- Node.js 18+
- Yarn
- [Aptos CLI](https://aptos.dev/tools/install-cli/)

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env and add your private key
```

3. Generate a new account (if needed):
```bash
aptos key generate --key-type ed25519
```

## Contract Features

The counter contract provides:
- `initialize`: Initialize counter for an account
- `increment`: Increment the counter value
- `decrement`: Decrement the counter value (with underflow protection)
- `get_value`: View function to get current counter value

## Compilation

```bash
yarn compile
# or
aptos move compile
```

## Testing

Run the TypeScript tests:
```bash
yarn test
```

Tests will:
1. Deploy the contract to devnet
2. Initialize a counter
3. Test increment/decrement operations
4. Verify counter values

## Deployment

### Using TypeScript:
```bash
yarn deploy
```

### Using Aptos CLI:
```bash
./scripts/deploy.sh
```

## Project Structure

```
contracts/aptos/
├── Move.toml           # Move package configuration
├── sources/
│   └── Counter.move    # Counter contract source
├── tests/
│   └── counter.test.ts # TypeScript integration tests
├── scripts/
│   ├── deploy.ts       # TypeScript deployment script
│   └── deploy.sh       # Shell deployment script
└── build/              # Compiled bytecode (generated)
```

## Environment Variables

- `APTOS_PRIVATE_KEY`: Your account's Ed25519 private key
- `APTOS_NETWORK`: Network to use (devnet/testnet/mainnet)
- `APTOS_NODE_URL`: Custom RPC endpoint (optional)
- `APTOS_FAUCET_URL`: Faucet URL for funding (optional)