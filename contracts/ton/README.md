# TON Smart Contracts

This directory contains TON blockchain smart contracts written in FunC and TypeScript wrappers.

## Project Structure

```
contracts/ton/
├── contracts/          # FunC smart contracts
│   └── counter.fc     # Basic counter contract
├── wrappers/          # TypeScript contract wrappers
│   └── Counter.ts     # Counter contract wrapper
├── tests/             # Contract tests
│   └── Counter.spec.ts
├── scripts/           # Deployment and interaction scripts
│   ├── deployCounter.ts
│   ├── incrementCounter.ts
│   ├── decrementCounter.ts
│   └── getCounter.ts
└── blueprint.config.ts # Blueprint configuration
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the required values:
```bash
cp .env.example .env
```

3. Get a TON Center API key from https://toncenter.com/ and add it to your `.env` file.

## Available Commands

### Compile Contracts
```bash
npm run compile
```

### Run Tests
```bash
npm test
```

### Deploy Contract
```bash
npm run deploy deployCounter
```

### Interact with Contract
```bash
# Increment counter
npm run deploy incrementCounter <contract_address>

# Decrement counter
npm run deploy decrementCounter <contract_address>

# Get counter value
npm run deploy getCounter <contract_address>
```

## Counter Contract

The counter contract implements a simple counter with three operations:
- **increment**: Increases the counter by 1 (opcode: 1)
- **decrement**: Decreases the counter by 1 (opcode: 2)
- **get_counter**: Returns the current counter value (getter method)

## Testing

Tests are written using the TON Sandbox and Jest. Run tests with:
```bash
npm test
```

## Environment Variables

- `TONCENTER_API_KEY`: Your TON Center API key for testnet/mainnet access
- `TON_NETWORK`: Network to use (testnet or mainnet)
- `DEPLOYER_MNEMONIC`: 24-word mnemonic for the deployment wallet
- `TON_ENDPOINT`: (Optional) Custom RPC endpoint
- `WALLET_VERSION`: (Optional) Wallet contract version (default: v4R2)
```