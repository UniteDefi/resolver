# Cross-Chain Swap Tests

This directory contains tests for the 1inch cross-chain swap functionality using the Unite protocol.

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build contracts:
   ```bash
   forge build
   ```

## Running Tests

### Simplified Test (Recommended)
This test creates and signs cross-chain orders for all supported testnet pairs:

```bash
npm run test:simplified
```

Supported chains:
- Ethereum Sepolia (11155111)
- Base Sepolia (84532)
- Arbitrum Sepolia (421614)

### Full Integration Test
This test performs complete cross-chain swaps including escrow deployment:

```bash
npm test
```

## Test Architecture

The tests use the 1inch Cross-Chain SDK with the following components:

1. **Order Creation**: Creates cross-chain swap orders with proper parameters
2. **Signature Verification**: Signs and verifies EIP-712 typed data
3. **SDK Patching**: Supports testnet chains by patching the SDK validation
4. **Resolver Integration**: Works with deployed resolver contracts

## Key Modifications

### SDK Testnet Support
The SDK only supports mainnet chains by default. We patch it to support testnets:

```typescript
const testToMainnet: Record<number, number> = {
  11155111: 1,     // Sepolia -> Ethereum
  84532: 137,      // Base Sepolia -> Polygon  
  421614: 42161,   // Arb Sepolia -> Arbitrum
};
```

### Resolver Contract Funding
The resolver contracts need ETH to pay safety deposits. In production, this would be handled differently, but for testing we fund them directly:

```typescript
// Fund resolver contract with 0.05 ETH for safety deposits
const fundTx = await resolver.sendTransaction({
  to: resolverContract.address,
  value: parseUnits("0.05", 18)
});
```

## Troubleshooting

### Insufficient Balance
If you see "Insufficient balance" errors, ensure:
1. Your test wallet has ETH on all test networks
2. Your test wallet has test USDT tokens (check deployments.json for token addresses)

### RPC Connection Issues
Make sure your RPC URLs are valid and have sufficient rate limits.

### Transaction Reverts
If transactions are reverting:
1. Check that resolver contracts are funded with ETH
2. Verify all contract addresses in deployments.json
3. Ensure proper approvals are set for the LimitOrderProtocol

## Contract Addresses

All contract addresses are stored in `deployments.json` in the project root.