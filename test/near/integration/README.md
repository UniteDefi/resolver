# Cross-Chain HTLC Integration Tests

This directory contains integration tests for cross-chain Hash Time Locked Contracts (HTLCs) between Near Protocol and Base Sepolia.

## Overview

The integration tests demonstrate atomic swaps between Near and Base Sepolia using HTLCs. The implementation includes:

- **Near Contracts**: Dutch auction and HTLC escrow contracts written in Rust
- **Base Contracts**: HTLC escrow and mock ERC20 contracts written in Solidity
- **Integration Tests**: TypeScript tests that coordinate cross-chain swaps

## Setup

1. **Install dependencies**:
   ```bash
   yarn install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your account details
   ```

3. **Build Near contracts**:
   ```bash
   cd ..
   cargo build --target wasm32-unknown-unknown --release
   ```

4. **Compile Base contracts**:
   ```bash
   yarn compile-contracts
   ```

## Deployment

1. **Deploy to Near testnet**:
   ```bash
   yarn deploy-near
   ```

2. **Deploy to Base Sepolia**:
   ```bash
   yarn deploy-base
   ```

## Running Tests

Run the full cross-chain integration test suite:
```bash
yarn test
```

## Test Scenarios

### 1. Near to Base Sepolia HTLC Flow
- Alice locks tokens on Base Sepolia
- Bob locks NEAR tokens with same hashlock
- Alice withdraws from Near using secret
- Bob withdraws from Base using revealed secret

### 2. Timeout Handling
- Tests proper refund mechanisms when HTLCs expire
- Ensures both chains handle timeouts correctly

### 3. Async Callback Testing
- Tests Near's async callback pattern for NEP-141 tokens
- Validates proper handling of cross-contract calls

## Architecture

### Contract Design
- **Near HTLC**: Supports both native NEAR and NEP-141 tokens
- **Base HTLC**: Supports ETH and ERC20 tokens
- Both use SHA256 for hash compatibility across chains

### Security Considerations
- Timelock ordering: Near timeout < Base timeout
- Safety deposits on Near for storage
- Proper event emission for monitoring

## Known Issues and Async Blockers

1. **Near Async Callbacks**: The current implementation uses callbacks for NEP-141 token transfers. This may introduce complexity in error handling.

2. **Cross-Chain Timing**: Block time differences between chains require careful timeout management.

3. **Gas Estimation**: Near's dynamic gas model may require adjustment of gas limits for complex operations.

## Development

### Adding New Tests
Tests are located in `tests/` directory. Follow the existing pattern:
1. Set up helpers
2. Generate shared secret
3. Create HTLCs on both chains
4. Execute swap or timeout flow
5. Verify final states

### Debugging
- Use `console.log` with prefixes like `[Test]`, `[NearHelper]`, `[BaseHelper]`
- Check `.deployed-addresses.json` for contract addresses
- Monitor both chain explorers for transaction details