# XRP Ledger Escrow Implementation

This package provides escrow functionality for the XRP Ledger, designed for cross-chain swaps in the Unite DeFi resolver.

## Features

- Native XRP Ledger escrow transactions
- Conditional escrows with hash locks (HTLC-style)
- Time-based escrows with finish/cancel conditions
- TypeScript implementation with full type safety
- Comprehensive test suite

## Setup

1. Install dependencies:
```bash
cd contracts/xrp
yarn install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your XRP addresses and secrets
```

3. Get test XRP:
   - Visit https://xrpl.org/xrp-testnet-faucet.html
   - Generate or use existing addresses
   - Fund them with test XRP

## Usage

### Creating an Escrow

```bash
yarn escrow:create
```

This will:
- Generate a condition/fulfillment pair
- Create an escrow with 10 XRP
- Set time windows for finishing and cancelling
- Output the transaction hash and fulfillment (save this!)

### Fulfilling an Escrow

```bash
yarn escrow:fulfill <creator_address> <sequence_number> [fulfillment]
```

Example:
```bash
yarn escrow:fulfill rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH 12345 A0220020ABCD...
```

### Cancelling an Escrow

```bash
yarn escrow:cancel <creator_address> <sequence_number>
```

## Testing

Run the test suite:
```bash
yarn test
```

Tests include:
- Condition/fulfillment generation
- Escrow parameter validation
- Cross-chain timing constraints
- Integration tests (requires funded accounts)

## Cross-Chain Integration

For cross-chain swaps:

1. **Timing**: XRP escrow `cancelAfter` must be > EVM contract deadline
2. **Hash Lock**: Use the same hash on both chains
3. **Amount**: Convert between XRP drops and EVM token decimals

Example flow:
```typescript
// 1. Generate shared secret
const { condition, fulfillment } = escrow.generateConditionAndFulfillment();

// 2. Create XRP escrow
await escrow.createEscrow({
  // ... parameters
  condition: condition,
  cancelAfter: now + 3600, // 1 hour
});

// 3. Create EVM escrow with same hash
// Extract hash: condition.substring(8, 72)

// 4. Reveal secret on one chain, then the other
```

## API Reference

### XRPEscrow Class

```typescript
const escrow = new XRPEscrow(serverUrl);

// Connect to XRPL
await escrow.connect();

// Generate HTLC parameters
const { condition, fulfillment } = escrow.generateConditionAndFulfillment();

// Create escrow
await escrow.createEscrow(config);

// Fulfill escrow
await escrow.fulfillEscrow(address, secret, creator, sequence, fulfillment);

// Cancel escrow
await escrow.cancelEscrow(address, secret, creator, sequence);

// Get escrows for address
const escrows = await escrow.getEscrows(address);
```

## Environment Variables

- `XRP_SERVER_URL`: XRPL server WebSocket URL
- `XRP_SOURCE_ADDRESS`: Escrow creator address
- `XRP_SOURCE_SECRET`: Escrow creator secret
- `XRP_DESTINATION_ADDRESS`: Escrow receiver address
- `XRP_DESTINATION_SECRET`: Escrow receiver secret