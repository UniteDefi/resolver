# Unite DeFi - Aptos Integration

This branch contains the Aptos/Move integration for the Unite DeFi cross-chain swap protocol, enabling trustless swaps between Ethereum-based chains and Aptos.

## Overview

The Aptos integration implements the Unite DeFi protocol using Move smart contracts, providing:
- Dutch auction mechanism for order discovery
- HTLC-based atomic swaps
- Resource account-based escrow isolation
- Cross-chain event coordination

## Architecture

### Move Modules

1. **Dutch Auction** (`test/aptos/sources/dutch_auction.move`)
   - Implements declining price auctions
   - Allows resolvers to discover and fill orders at optimal prices
   - Manages auction lifecycle and pricing curves

2. **Escrow Factory** (`test/aptos/sources/escrow_factory.move`)
   - Creates isolated escrows using resource accounts
   - Manages escrow lifecycle
   - Handles cross-chain coordination

3. **HTLC Escrow** (`test/aptos/sources/htlc_escrow.move`)
   - Implements Hash Time-Locked Contracts
   - Supports both source and destination escrows
   - Handles secret reveal and timeout mechanisms

4. **Events** (`test/aptos/sources/events.move`)
   - Defines cross-chain event types
   - Enables monitoring and coordination

### TypeScript Integration

1. **Aptos Client Helper** (`tests/aptos/helpers/aptos-client.ts`)
   - Wrapper around Aptos SDK
   - Simplified transaction submission
   - Event monitoring utilities

2. **Wallet Implementation** (`tests/aptos/wallet.ts`)
   - Aptos wallet management
   - Transaction signing
   - Balance queries

3. **Integration Tests** (`tests/aptos/main-integration.spec.ts`)
   - Comprehensive test suite
   - Cross-chain flow simulation
   - Edge case coverage

4. **Mock Relayer** (`tests/mock-relayer/relayer.service.ts`)
   - Simulates cross-chain relayer behavior
   - Enables full flow testing
   - Event coordination

## Prerequisites

- Node.js >= 18
- Yarn package manager
- Aptos CLI (for deployment)
- Rust (for Move compilation)

## Setup Instructions

### 1. Install Dependencies

```bash
# Install Node dependencies
yarn install

# Install Aptos CLI (if not already installed)
curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3

# Install Move dependencies
cd test/aptos
aptos move compile
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
# Aptos Configuration
APTOS_NODE_URL=https://fullnode.devnet.aptoslabs.com/v1
APTOS_FAUCET_URL=https://faucet.devnet.aptoslabs.com

# Test Account Private Keys (DO NOT USE IN PRODUCTION)
APTOS_DEPLOYER_KEY=0x1234567890123456789012345678901234567890123456789012345678901234
APTOS_USER_KEY=0x2345678901234567890123456789012345678901234567890123456789012345
APTOS_RESOLVER_KEY=0x3456789012345678901234567890123456789012345678901234567890123456

# Ethereum Configuration (for cross-chain testing)
ETH_RPC_URL=http://localhost:8545
ETH_CHAIN_ID=1
```

### 3. Compile Move Modules

```bash
cd test/aptos
aptos move compile --named-addresses unite_defi=0x1
```

### 4. Run Tests

```bash
# Run Move unit tests
cd test/aptos
aptos move test

# Run TypeScript integration tests
cd ../..
yarn test tests/aptos/main-integration.spec.ts

# Run mock relayer tests
yarn test tests/mock-relayer/relayer.test.ts
```

## Deployment Guide

### Deploy to Devnet

1. Create a new account for deployment:
```bash
aptos init --profile devnet
```

2. Fund the account:
```bash
aptos account fund-with-faucet --profile devnet
```

3. Deploy modules:
```bash
cd test/aptos
aptos move publish --profile devnet --named-addresses unite_defi=default
```

4. Initialize modules:
```bash
# Initialize Dutch Auction
aptos move run --profile devnet \
  --function-id 'default::dutch_auction::initialize'

# Initialize Escrow Factory  
aptos move run --profile devnet \
  --function-id 'default::escrow_factory::initialize'
```

## Usage Example

### Creating a Cross-Chain Swap

```typescript
import { AptosClientHelper } from "./helpers/aptos-client";
import { Account } from "@aptos-labs/ts-sdk";

// Initialize client
const client = new AptosClientHelper();
const user = Account.generate();

// Create order on source chain (Ethereum)
const orderId = "0x..."; // 32-byte order ID
const secretHash = "0x..."; // Hash of secret

// Create HTLC on Aptos (destination)
const tx = await client.submitTransaction(user, {
  function: `${ESCROW_FACTORY}::htlc_escrow::create_htlc`,
  functionArguments: [
    orderId,
    "1000000", // 1 USDC (6 decimals)
    secretHash,
    Math.floor(Date.now() / 1000) + 3600, // 1 hour timeout
    resolver.address,
    "destination"
  ],
  typeArguments: []
});

// Monitor for secret reveal and withdraw
```

## Key Differences from Ethereum

1. **Resource Accounts**: Used instead of CREATE2 for deterministic addresses
2. **Linear Types**: Resources must be explicitly managed
3. **Events**: Different event system requiring custom monitoring
4. **Time Units**: Microseconds instead of seconds
5. **Signatures**: Ed25519 instead of ECDSA

## Testing

### Unit Tests
Move unit tests are located in `test/aptos/tests/` and test individual module functionality.

### Integration Tests
TypeScript integration tests simulate full cross-chain flows including:
- Order creation and filling
- Secret reveal and withdrawal
- Timeout and cancellation
- Multi-fill scenarios

### Mock Relayer
The mock relayer simulates resolver behavior for testing without actual cross-chain infrastructure.

## Security Considerations

1. **Resource Safety**: Move's type system prevents resource duplication/loss
2. **Timelock Validation**: Ensure sufficient time for cross-chain finality
3. **Secret Management**: Never reuse secrets across orders
4. **Event Monitoring**: Reliable event monitoring is critical
5. **Gas Estimation**: Account for Aptos gas model differences

## Known Issues and Limitations

See [BLOCKERS_APTOS.md](./BLOCKERS_APTOS.md) for detailed list of Move-specific challenges and workarounds.

## Contributing

1. Follow Move best practices and style guide
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Consider cross-chain implications

## Resources

- [Aptos Developer Docs](https://aptos.dev)
- [Move Language Book](https://move-language.github.io/move/)
- [Unite DeFi Protocol Docs](https://unite-defi.com/docs)
- [Cross-Chain Best Practices](https://unite-defi.com/security)

## License

This project is licensed under the MIT License - see the LICENSE file for details.