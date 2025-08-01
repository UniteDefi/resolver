# Bitcoin HTLC Implementation

Hash Time Locked Contract (HTLC) implementation using bitcoinjs-lib for cross-chain atomic swaps.

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Bitcoin regtest node configuration
```

3. Start Bitcoin regtest node:
```bash
bitcoind -regtest -server -rpcuser=rpcuser -rpcpassword=rpcpassword
```

## Usage

### Create HTLC
```bash
yarn dev scripts/create_htlc.ts
```

This will output the HTLC address and required environment variables for spending.

### Fund HTLC
```bash
yarn dev scripts/fund_address.ts <htlc_address> 0.1
```

### Claim HTLC (with preimage)
```bash
SPEND_MODE=claim yarn dev scripts/spend_htlc.ts
```

### Refund HTLC (after timelock)
```bash
SPEND_MODE=refund yarn dev scripts/spend_htlc.ts
```

## Testing

Run tests against regtest:
```bash
yarn test
```

## Scripts

- `create_htlc.ts` - Creates a new HTLC with configurable parameters
- `spend_htlc.ts` - Claims or refunds an HTLC
- `fund_address.ts` - Funds any Bitcoin address (useful for testing)

## Architecture

- `src/htlc.ts` - Core HTLC script creation and transaction building
- `src/utils.ts` - Bitcoin utilities and helpers
- `src/types.ts` - TypeScript type definitions
- `tests/htlc.test.ts` - Comprehensive test suite