# ICP Counter Canister

A simple counter canister implementation for the Internet Computer Protocol (ICP) with TypeScript testing.

## Prerequisites

- [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install) - The DFINITY Canister SDK
- Node.js v16 or higher
- yarn package manager

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

## Local Development

1. Start the local ICP replica and deploy:
```bash
./scripts/deploy_local.sh
```

2. Run tests:
```bash
yarn test
```

## Testnet Deployment

1. Set up testnet wallet:
```bash
./scripts/get_wallet_info.sh
```

2. Fund your wallet using the testnet faucet:
   - Visit: https://faucet.testnet.dfinity.network
   - Enter your Account ID from the previous step
   - Request testnet ICP

3. Deploy to testnet:
```bash
./scripts/deploy_testnet.sh
```

## Mainnet Deployment

1. Configure your dfx identity:
```bash
dfx identity use <your-identity>
dfx wallet --network ic balance
```

2. Deploy to IC mainnet:
```bash
./scripts/deploy_ic.sh
```

## Canister Interface

The counter canister exposes the following methods:

- `increment(): Nat` - Increments the counter and returns the new value
- `decrement(): Nat` - Decrements the counter (minimum 0) and returns the new value
- `getValue(): Nat` - Returns the current counter value (query method)
- `reset(): ()` - Resets the counter to 0

## Testing

Tests are written using Jest and @dfinity/agent. Run tests with:

```bash
yarn test
```

## Project Structure

```
contracts/icp/
├── src/
│   └── counter/
│       └── main.mo          # Counter canister implementation
├── tests/
│   ├── counter.test.ts      # Counter canister tests
│   └── setup.ts            # Test setup
├── scripts/
│   ├── deploy_local.sh     # Local deployment script
│   ├── deploy_testnet.sh   # Testnet deployment script
│   ├── deploy_ic.sh        # IC mainnet deployment script
│   ├── get_wallet_info.sh  # Get wallet addresses for funding
│   ├── setup_testnet_wallet.sh  # Initial testnet wallet setup
│   └── generate_declarations.sh  # Generate TypeScript declarations
├── dfx.json                # DFX configuration
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript configuration
├── jest.config.js          # Jest configuration
└── .env.example            # Environment variables template
```