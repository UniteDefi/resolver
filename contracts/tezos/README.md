# Tezos Smart Contracts

This directory contains Tezos smart contracts written in SmartPy.

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Install SmartPy:
```bash
pip3 install smartpy
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration.

## Development

### Compile Contracts

```bash
npm run compile
# or
./scripts/compile.sh
```

### Run Tests

```bash
npm test
```

### Deploy Contracts

Local deployment:
```bash
npm run deploy:local
```

Testnet deployment:
```bash
npm run deploy:testnet
```

## Contract: Counter

A simple counter contract with the following entrypoints:
- `increment(amount)` - Increases the counter by the specified amount
- `decrement(amount)` - Decreases the counter by the specified amount
- `get_value()` - Returns the current counter value

## Testing

Tests are written in TypeScript using Jest and Taquito. To run tests:

1. Start a local Tezos sandbox (e.g., using Flextesa)
2. Run `npm test`

## Environment Variables

See `.env.example` for required environment variables:
- `TEZOS_*_RPC_URL` - RPC endpoints for different networks
- `TEZOS_*_SECRET_KEY` - Private keys for different networks
- `COUNTER_INITIAL_VALUE` - Initial value for the counter contract