# EOS Counter Contract

A simple counter smart contract for EOSIO blockchain with TypeScript testing and deployment scripts.

## Prerequisites

- EOSIO CDT (Contract Development Toolkit) v3.0+
- Node.js v16+
- Yarn package manager
- Local EOSIO node or access to testnet

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration

## Building

Compile the smart contract:
```bash
yarn build
```

This creates `counter.wasm` in the `build/` directory.

## Testing

Run the TypeScript tests:
```bash
yarn test
```

## Deployment

### Local Node

1. Start your local EOSIO node
2. Create accounts (if not exists):
```bash
./scripts/create_accounts.sh
```

3. Deploy contract:
```bash
yarn deploy:local
```

### Testnet

```bash
yarn deploy:testnet
```

## Contract Actions

- **increment(user)** - Increment user's counter by 1
- **decrement(user)** - Decrement user's counter by 1
- **reset(user)** - Reset user's counter to 0
- **getvalue(user)** - Print current counter value
- **notify(user, value)** - Internal notification action

## Interaction

Use the interaction script:
```bash
# Increment alice's counter
yarn ts-node scripts/interact.ts increment alice

# Decrement bob's counter
yarn ts-node scripts/interact.ts decrement bob

# Reset charlie's counter
yarn ts-node scripts/interact.ts reset charlie

# Get david's counter value
yarn ts-node scripts/interact.ts getvalue david
```

## Table Structure

**counters** table:
- `user` (name) - Primary key
- `value` (uint64) - Counter value
- `last_modified` (uint64) - Unix timestamp

## Development

The project structure:
```
contracts/eos/
├── src/              # C++ source files
├── include/          # C++ header files
├── tests/            # TypeScript tests
├── scripts/          # Deployment and utility scripts
├── build/            # Compiled WASM output
└── CMakeLists.txt    # CMake configuration
```