# Unite DeFi Resolver Architecture Guide

This document provides a comprehensive overview of the Unite DeFi Resolver architecture, designed to help Claude sessions and developers understand the codebase structure and implementation details.

## System Overview

Unite DeFi is a cross-chain swap protocol that enables trustless asset transfers between different blockchains using a combination of:
- **HTLC (Hash Time-Locked Contracts)**: For secure atomic swaps
- **Dutch Auction Mechanism**: For price discovery and resolver competition
- **Resolver Network**: Decentralized network of operators who execute swaps

## Core Components

### 1. Smart Contracts (`/contracts/`)

The protocol deploys specialized contracts on each supported blockchain:

#### EVM Contracts (`/contracts/evm/`)
- **UniteEscrowFactory.sol**: Factory contract for creating escrow instances
- **Resolver.sol**: Resolver contract for committing to and executing swaps
- **LimitOrderProtocol.sol**: Integration with 1inch limit order protocol
- **Mock Tokens**: Test tokens for development (MockERC20, MockWrappedNative)

Key libraries and dependencies:
- 1inch cross-chain-swap library
- OpenZeppelin contracts
- Foundry for testing and deployment

#### Non-EVM Contracts

**Aptos (`/contracts/aptos/`)** - Move Language:
- `escrow_factory.move`: Factory for creating escrows
- `htlc_escrow.move`: HTLC implementation
- `relayer_contract.move`: Relayer/resolver logic
- `dutch_auction.move`: Auction mechanism

**Sui (`/contracts/sui/`)** - Move Language:
- `unite_escrow_factory.move`: Factory pattern implementation
- `htlc_src.move` / `htlc_dst.move`: Source and destination HTLC logic
- `simple_relayer.move`: Basic relayer implementation

**Near (`/contracts/near/`)** - Rust:
- `htlc_escrow.rs`: HTLC contract implementation
- `dutch_auction.rs`: Auction logic
- `relayer_contract.rs`: Resolver operations

**Tron (`/contracts/tron/`)** - Solidity (TVM compatible):
- Similar structure to EVM contracts with Tron-specific adaptations

### 2. Resolver Service (`/service/`)

The resolver service is a Node.js application that monitors and executes cross-chain swaps.

#### Core Service Files

**`enhanced_sqs_resolver.ts`** - Main entry point:
```typescript
class EnhancedSQSResolverService {
  - Monitors AWS SQS queue for swap orders
  - Validates order profitability
  - Executes commitments on-chain
  - Manages multiple resolver strategies
}
```

**`common/` directory**:
- `config.ts`: Chain configurations and RPC endpoints
- `deployment-loader.ts`: Loads contract addresses from deployments.json
- `dutch-auction.service.ts`: Calculates Dutch auction prices
- `logger.ts`: Logging utilities

**`resolvers/` directory** - Different resolver strategies:
- `base_resolver.ts`: Abstract base class for all resolvers
- `fast_resolver.ts`: Optimizes for speed
- `patient_resolver.ts`: Waits for better prices
- `balanced_resolver.ts`: Balanced approach
- `random_resolver.ts`: Randomized strategy
- `token_base_resolver.ts`: Token-specific strategies

### 3. Message Flow

```
1. User initiates swap on source chain
   ↓
2. Relayer service broadcasts order to SQS
   ↓
3. Resolvers monitor SQS queue
   ↓
4. Resolver evaluates profitability
   ↓
5. Resolver commits on destination chain
   ↓
6. User reveals secret on source chain
   ↓
7. Resolver claims funds using secret
```

### 4. Order Structure

Orders broadcast to SQS contain:
```json
{
  "orderHash": "0x...",
  "srcChainId": 1,
  "dstChainId": 137,
  "srcToken": "0x...",
  "dstToken": "0x...",
  "srcAmount": "1000000000000000000",
  "dstAmount": "2000000000",
  "deadline": 1234567890,
  "nonce": 1,
  "maker": "0x...",
  "signature": "0x..."
}
```

### 5. Testing Infrastructure (`/testing/`)

- Test scripts for various scenarios
- Chain-specific test constants
- Integration test utilities
- Performance testing tools

## Key Design Patterns

### 1. Factory Pattern
Each blockchain implements a factory contract that creates isolated escrow instances for each swap, ensuring security and preventing reentrancy.

### 2. HTLC Pattern
- **Hash Lock**: Funds locked with hash of secret
- **Time Lock**: Automatic refund after timeout
- **Atomic**: Either both transfers complete or neither

### 3. Dutch Auction
- Starting price decreases over time
- First resolver to commit wins
- Incentivizes quick resolution while allowing price discovery

### 4. Multi-Strategy Resolvers
Different resolver implementations allow operators to choose strategies based on:
- Risk tolerance
- Capital efficiency
- Speed requirements
- Market conditions

## Chain-Specific Considerations

### EVM Chains
- Use CREATE2 for deterministic addresses
- Gas optimization through minimal proxy pattern
- Support for EIP-1559 transactions

### Aptos
- Resource-oriented programming model
- Module-based architecture
- Native Move language features

### Sui
- Object-centric storage model
- Programmable transaction blocks
- Parallel transaction execution

### Near
- Account-based model
- Asynchronous cross-contract calls
- Storage staking requirements

### Tron
- Energy and bandwidth model
- TRC-20 token standard
- Specific transaction format

## Security Considerations

1. **Timelock Protection**: All swaps have expiry to prevent indefinite locks
2. **Signature Verification**: All orders verified on-chain
3. **Reentrancy Guards**: Protected against reentrancy attacks
4. **Access Control**: Only authorized resolvers can commit
5. **Slippage Protection**: Min/max amount validations

## Development Workflow

1. **Local Development**:
   - Use local chains (Hardhat, Ganache)
   - Mock contracts for testing
   - Local SQS using LocalStack

2. **Testnet Deployment**:
   - Deploy contracts to testnets
   - Use testnet faucets for tokens
   - AWS SQS sandbox environment

3. **Mainnet Deployment**:
   - Audit contracts
   - Progressive rollout
   - Monitor resolver performance

## Common Operations

### Adding a New Chain

1. Create contract implementations in `/contracts/<chain>/`
2. Add chain config in `service/common/config.ts`
3. Update `deployments.json` with addresses
4. Add chain-specific logic in resolver service
5. Create test constants in `testing/constants/<chain>.ts`

### Updating Resolver Strategy

1. Extend `BaseResolver` class
2. Implement required methods
3. Add strategy to resolver factory
4. Test with various market conditions

### Debugging Failed Swaps

1. Check resolver logs for errors
2. Verify on-chain transaction status
3. Validate order parameters
4. Check timelock expiration
5. Verify signature and nonce

## Performance Optimization

- **Batch Operations**: Process multiple orders in single transaction
- **Caching**: Cache token prices and gas estimates
- **Connection Pooling**: Reuse RPC connections
- **Queue Management**: Efficient SQS polling with backoff

## Monitoring and Alerts

Key metrics to monitor:
- Order success rate
- Average execution time
- Profitability per swap
- Gas costs
- System uptime

## Future Enhancements

- Support for more chains
- Advanced routing algorithms
- MEV protection mechanisms
- Decentralized resolver coordination
- Cross-chain liquidity aggregation