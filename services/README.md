# UniteDefi Resolver Services

This directory contains the TypeScript implementation of resolver services that compete to settle Dutch auction orders across multiple chains.

## Architecture

### Services Structure
```
services/
├── common/           # Shared utilities and configuration
│   ├── config.ts     # Chain configs, ABIs, constants
│   └── logger.ts     # Logging utility
├── resolvers/        # Resolver implementations
│   ├── base_resolver.ts     # Base class with core functionality
│   ├── fast_resolver.ts     # Minimal delay strategy
│   ├── patient_resolver.ts  # Waits for better prices
│   ├── balanced_resolver.ts # Moderate approach
│   └── random_resolver.ts   # Unpredictable behavior
├── seller/           # Seller service
│   └── seller_service.ts    # Creates test auctions
├── orchestrator.ts   # Main runner for all services
└── edge_case_tester.ts      # Edge case testing suite
```

## Quick Start

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Run single-chain test (recommended for initial testing):
   ```bash
   pnpm start:single-chain
   ```

3. Run multi-chain test:
   ```bash
   pnpm start:multi-chain
   ```

4. Run edge case tests:
   ```bash
   pnpm start:edge-cases
   ```

## How It Works

### 1. Seller Service
- Creates Dutch auctions with linearly decreasing prices
- Randomly selects from predefined test scenarios
- Posts auctions to random chains at intervals

### 2. Resolver Services
Each resolver monitors all configured chains for new auctions and implements different strategies:

- **Fast Resolver**: Attempts to settle immediately (100ms delay)
- **Patient Resolver**: Waits until price drops 50% before attempting
- **Balanced Resolver**: Moderate 500ms delay
- **Random Resolver**: Unpredictable behavior with random delays and skips

### 3. Competition Flow
1. Seller creates auction with start price → end price over duration
2. Multiple resolvers detect the auction event
3. Each resolver evaluates if current price is acceptable
4. Resolvers add competition delays based on their strategy
5. First resolver to successfully call `settleAuction()` wins
6. Others receive "Auction is not active" error

## Test Scenarios

### Default Scenarios
- **Quick Drop**: 0.002 → 0.0005 ETH over 1 minute
- **Medium Auction**: 0.003 → 0.001 ETH over 3 minutes
- **Slow Decline**: 0.005 → 0.0005 ETH over 5 minutes
- **Micro Auction**: 0.001 → 0.0002 ETH over 2 minutes

### Edge Cases Tested
- Zero duration (instant settlement)
- Invalid price increase (should fail)
- Very long duration (24 hours)
- Tiny amounts (1 gwei)
- Large price drops (99.9%)
- Concurrent auctions
- Race conditions with 10 resolvers

## Configuration

### Environment Variables
- `TEST_MNEMONIC`: HD wallet mnemonic for generating test wallets
- `TEST_CHAINS`: Comma-separated list of chains to test

### Resolver Configuration
```typescript
{
  id: string,              // Resolver identifier
  privateKey: string,      // Wallet private key
  maxPriceWei: string,     // Maximum price willing to pay (ETH)
  minBalanceWei: string,   // Minimum balance warning threshold
  competitionDelayMs: number, // Base delay before attempting settlement
  chains: string[]         // Chains to monitor
}
```

## Monitoring Output

The services provide detailed logging:
```
[2024-01-01T12:00:00.000Z] [Seller] Creating Quick Drop auction on ethereum_sepolia
[2024-01-01T12:00:01.000Z] [Resolver-FAST-1] New auction detected on ethereum_sepolia
[2024-01-01T12:00:01.100Z] [Resolver-FAST-1] Attempting to settle auction at 0.0018 ETH
[2024-01-01T12:00:02.000Z] [Resolver-PATIENT-1] Waiting for better price (10% complete)
[2024-01-01T12:00:03.000Z] [Resolver-FAST-1] ✅ Auction settled successfully!
```

## Safety Features

1. **Balance Checks**: Warns when resolver balance is low
2. **Price Validation**: Only settles if price is below max threshold
3. **Double Verification**: Checks auction is still active before settling
4. **Excess Refund**: Sends 10% buffer, excess is automatically refunded
5. **Error Handling**: Graceful handling of race conditions

## Testing Recommendations

1. Start with single-chain testing to verify basic functionality
2. Ensure test wallets have sufficient balance (0.1 ETH recommended)
3. Monitor logs to understand resolver competition dynamics
4. Run edge case tests to verify error handling
5. Test on testnets only - never use on mainnet

## Troubleshooting

### Common Issues

1. **"Auction is not active"**: Another resolver won the race
2. **"Low balance"**: Fund test wallets with testnet ETH
3. **No auctions created**: Check seller wallet balance
4. **Connection errors**: Verify RPC endpoints are accessible

### Debug Tips
- Increase logging verbosity by modifying logger calls
- Reduce auction interval for more frequent testing
- Adjust resolver delays to change competition dynamics
- Use single resolver to test without competition