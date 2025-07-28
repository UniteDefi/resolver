# Cross-Chain Swap Resolver

This repository implements the resolver component of a centralized relayer-based cross-chain swap architecture. The system enables gasless cross-chain token swaps through a coordinated network of resolvers.

## Architecture Overview

### Cross-Chain Swap Flow

The system orchestrates cross-chain swaps through a centralized relayer service that coordinates between users and resolvers:

1. **User Initiation**: User approves the relayer contract to spend their source tokens and submits a swap order
2. **Order Broadcasting**: Relayer broadcasts the order with current market price to all registered resolvers  
3. **Resolver Commitment**: First resolver to find the price acceptable commits to fulfill the order (5-minute timer starts)
4. **Escrow Deployment**: Committed resolver deploys escrow contracts on both chains with safety deposits
5. **Fund Movement**: Relayer transfers user's pre-approved funds to source escrow
6. **Settlement**: Resolver deposits destination tokens to destination escrow
7. **Secret Revelation**: Relayer reveals secret on destination chain, unlocking funds for user
8. **Completion**: Resolver uses revealed secret to claim source funds and safety deposit

### Key Benefits

- **Minimal Capital Requirements**: Resolvers only need safety deposits, not full trade amounts
- **No Gas Wars**: Single resolver commitment prevents competition-driven gas price escalation  
- **Guaranteed Execution**: 5-minute timeout with rescue mechanism ensures order completion
- **Penalty System**: Failed resolvers forfeit safety deposits to rescue resolvers

## Components

### 1. Cross-Chain Resolver (`CrossChainResolver`)

Main resolver service that:
- Monitors relayer API for active swap orders
- Evaluates orders based on price and chain support
- Commits to acceptable orders
- Deploys escrow contracts with safety deposits
- Executes cross-chain settlements
- Handles rescue opportunities when other resolvers fail

### 2. Relayer Contract (`RelayerContract.sol`)

Smart contract that:
- Manages user token approvals
- Transfers user funds to escrow contracts
- Tracks order states and fund movements
- Provides authorization for relayer services

### 3. Escrow System

Uses the 1inch cross-chain-swap escrow contracts:
- `EscrowSrc`: Locks user funds on source chain
- `EscrowDst`: Holds resolver funds on destination chain  
- `EscrowFactory`: Deploys escrow contracts deterministically
- HTLC (Hash Time Locked Contract) mechanism for atomic swaps

## Quick Start

### Prerequisites

- Node.js 18+
- Private key with funds on supported chains
- Access to blockchain RPC endpoints

### Installation

```bash
# Install dependencies
yarn install

# Copy and configure environment
cp .env.example .env
# Edit .env with your configuration
```

### Configuration

Set the following environment variables:

```bash
# Resolver identity
RESOLVER_ID=resolver-1
RESOLVER_PRIVATE_KEY=your_private_key_here

# Relayer service endpoint
RELAYER_API_URL=http://localhost:3000

# Strategy parameters
MAX_ACCEPTABLE_PRICE=0.005  # Maximum price willing to accept
MIN_SAFETY_DEPOSIT=0.01     # Safety deposit amount in native tokens
POLL_INTERVAL_MS=10000      # Order polling interval

# RPC endpoints for supported chains
ETHEREUM_RPC_URL=https://eth.llamarpc.com
BASE_RPC_URL=https://base.llamarpc.com
# ... other chains

# Escrow factory addresses (deploy first)
ETHEREUM_ESCROW_FACTORY=0x...
BASE_ESCROW_FACTORY=0x...
```

### Running

```bash
# Start the cross-chain resolver
yarn start:cross-chain-resolver
```

### Running Tests

1. Foundry tests:
   ```bash
   forge test
   ```

2. Integration tests:
   ```bash
   SRC_CHAIN_RPC=<ETH_RPC> DST_CHAIN_RPC=<BSC_RPC> pnpm test
   ```

## Deployed Contracts

### SimpleDutchAuction
- Ethereum Sepolia: `0x66AEACCcF67b99E96831f60F821377010aF9B763`
- Base Sepolia: `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9`
- Polygon Amoy: `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9`
- Arbitrum Sepolia: `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9`

## Architecture Overview

### Smart Contracts

1. **SimpleDutchAuction.sol**: Standalone Dutch auction implementation
2. **SimpleUniteResolver.sol**: Integrates Dutch auction with escrow capabilities
3. **UniteResolver.sol**: Full integration with 1inch Fusion+ protocol
4. **Resolver.sol**: Base resolver from 1inch for cross-chain swaps

### Resolver Services

1. **Base Resolver**: Core functionality for monitoring and settling auctions
2. **Fast Resolver**: Minimal delay, attempts to be first
3. **Patient Resolver**: Waits for 50% price drop before attempting
4. **Balanced Resolver**: Moderate approach with balanced timing
5. **Random Resolver**: Unpredictable behavior for testing

### Flow

1. Seller creates Dutch auction with decreasing price
2. Multiple resolvers monitor for new auctions
3. Resolvers evaluate prices based on their strategies
4. First resolver to successfully settle wins the auction
5. For cross-chain orders, HTLC ensures atomic completion

## Development

### Building Contracts
```bash
forge build
```

### Running Local Services
```bash
pnpm build
pnpm start:resolvers
```

### Adding New Chains
Update `services/common/config.ts` with new chain configuration.

## Test Accounts

When using test mnemonic:
- Account 0: Seller
- Account 1-4: Resolvers

## Documentation

- [Services Documentation](./services/README.md) - Detailed resolver service guide
- [Test Results](./docs/TEST_RESULTS.md) - Deployment and testing outcomes
- [Project Overview](./docs/UNITE_README.md) - Full project documentation

## License

MIT