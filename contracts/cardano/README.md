# Cardano Counter Validator

A simple counter validator implemented in Aiken that validates increment/decrement operations.

## Prerequisites

- [Aiken](https://aiken-lang.org/installation-instructions) - Smart contract language for Cardano
- [Node.js](https://nodejs.org/) >= 18.0.0
- [Yarn](https://yarnpkg.com/) package manager

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure your `.env` file with:
   - Blockfrost or Maestro API keys
   - Wallet private keys for deployment

## Building

Build the Aiken validator:
```bash
yarn build:aiken
# or
./scripts/build.sh
```

This will compile the validator and generate `plutus.json`.

## Testing

Run the test suite:
```bash
yarn test
```

## Deployment

Deploy to Preprod:
```bash
yarn deploy:preprod
```

Deploy to Mainnet:
```bash
yarn deploy:mainnet
```

Options:
- `--network=preprod|mainnet` - Target network (default: preprod)
- `--provider=blockfrost|maestro` - Provider to use (default: blockfrost)

## Project Structure

```
contracts/cardano/
├── validators/          # Aiken validator source code
│   └── counter.ak      # Counter validator implementation
├── lib/                # Aiken library modules
│   └── counter/
│       └── utils.ak    # Utility functions
├── tests/              # TypeScript test suite
│   ├── counter.test.ts # Counter validator tests
│   └── utils/          # Test utilities
├── scripts/            # Deployment and build scripts
│   ├── deploy.ts       # Deployment script
│   └── build.sh        # Build script
├── aiken.toml          # Aiken project configuration
├── package.json        # Node.js dependencies
└── plutus.json         # Compiled validator (generated)
```

## Validator Details

The counter validator:
- Stores an owner (public key hash) and counter value
- Supports two operations: Increment and Decrement
- Requires owner's signature for all operations
- Prevents counter from going below 0

### Datum Structure
```haskell
type Datum {
  owner: Hash<Blake2b_224, VerificationKey>,
  counter: Int,
}
```

### Redeemer Actions
- `Increment` - Increases counter by 1
- `Decrement` - Decreases counter by 1 (fails if counter is 0)

## Environment Variables

See `.env.example` for required configuration:
- `BLOCKFROST_PROJECT_ID` - Blockfrost API key
- `PREPROD_WALLET_PRIVATE_KEY` - Wallet key for preprod deployment
- `MAINNET_WALLET_PRIVATE_KEY` - Wallet key for mainnet deployment