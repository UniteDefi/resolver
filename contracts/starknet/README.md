# Unite StarkNet HTLC Contracts

Cross-chain atomic swap implementation using Hash Time Locked Contracts (HTLC) between EVM chains and StarkNet.

## 🌉 Overview

This implementation extends the Unite Protocol to support cross-chain swaps between EVM-based chains (like Base Sepolia) and StarkNet. It uses HTLC mechanisms to ensure atomic execution across different blockchain networks.

## 🚀 Quick Start

### Prerequisites

1. **Scarb** (StarkNet package manager)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh
   ```

2. **Node.js** (v18+)
   ```bash
   # Install dependencies
   yarn install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your account details
   ```

### 🔧 Setup Commands

Run these 4 commands in sequence from the `contracts/starknet` directory:

```bash
# Command 1: Create Cairo contracts
chmod +x scripts/create-contracts.sh && ./scripts/create-contracts.sh

# Command 2: Create remaining contracts and scripts  
chmod +x scripts/create-remaining.sh && ./scripts/create-remaining.sh

# Command 3: Create cross-chain test files
chmod +x scripts/create-tests.sh && ./scripts/create-tests.sh

# Command 4: Create configuration files (this step)
chmod +x scripts/create-config.sh && ./scripts/create-config.sh
```

### 📦 Build and Deploy

```bash
# Compile contracts
yarn build

# Deploy all contracts
yarn deploy:all

# Fund resolvers with test tokens
yarn deploy:fund

# Verify deployment
yarn setup:verify
```

### 🧪 Testing

```bash
# Test StarkNet contracts
yarn test:starknet

# Test cross-chain integration
yarn test:crosschain

# Run all tests
yarn test
```

## 🏗️ Architecture

### Core Components

1. **UniteLimitOrderProtocol** - Order matching and execution
2. **UniteEscrowFactory** - Deploys and manages escrow contracts
3. **UniteEscrow** - HTLC implementation with partial fills
4. **UniteResolver** - Resolver interface for order execution
5. **Mock Tokens** - Test tokens for development

### Cross-Chain Flow

```
User (Base Sepolia)     Resolvers           User (StarkNet)
       |                    |                      |
   1. Create Order          |                      |
       |                    |                      |
   2. Sign Order ---------> |                      |
       |                    |                      |
       |              3. Deploy Source Escrows     |
       |                    |                      |
       |              4. Deploy Dest Escrows ----> |
       |                    |                      |
   5. Lock USDT             |               6. Lock DAI
       |                    |                      |
       |              7. Secret Revealed           |
       |                    |                      |
   8. Resolvers get USDT    |        9. User gets DAI
```

## 📋 Contract Addresses

After deployment, addresses are saved to `deployments.json`:

### StarkNet Sepolia
- UniteLimitOrderProtocol: `0x...`
- UniteEscrowFactory: `0x...`
- UniteResolver0: `0x...`
- UniteResolver1: `0x...`
- MockUSDT: `0x...`
- MockDAI: `0x...`

### Base Sepolia (from EVM deployment)
- UniteLimitOrderProtocol: `0x...`
- UniteEscrowFactory: `0x...`
- MockUSDT: `0x...`
- MockDAI: `0x...`

## 🔧 Configuration

### Environment Variables

Key configuration in `.env`:

```bash
# StarkNet Configuration
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io/rpc/v0_7

# EVM Configuration (for cross-chain)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x...

# Resolver Configuration
RESOLVER_PRIVATE_KEY_0=0x...
RESOLVER_PRIVATE_KEY_1=0x...
```

### Supported Swaps

- Base Sepolia USDT ↔ StarkNet DAI
- Base Sepolia DAI ↔ StarkNet USDT  
- Base Sepolia WETH ↔ StarkNet Wrapped Native

## 🧪 Testing Cross-Chain Swaps

### Running Tests

```bash
# Full cross-chain test
yarn crosschain:test

# Individual test suites
yarn test:integration
yarn test:starknet
```

### Test Scenarios

1. **Base Sepolia → StarkNet**
   - User swaps USDT for DAI
   - Multiple resolvers with partial fills
   - HTLC atomic execution

2. **StarkNet → Base Sepolia**
   - User swaps DAI for USDT
   - Reverse direction testing
   - Bidirectional verification

## 🔐 Security Features

- **HTLC Atomic Swaps** - Ensures atomic execution or full rollback
- **Safety Deposits** - Resolvers stake ETH/STRK to participate
- **Timelock Mechanisms** - Time-based withdrawal and cancellation
- **Partial Fill Support** - Multiple resolvers can fill portions
- **Public Withdrawal Incentives** - Rewards for executing expired orders

## 🛠️ Development

### Project Structure

```
contracts/starknet/
├── src/
│   ├── interfaces/          # Contract interfaces
│   ├── libraries/           # Utility libraries  
│   ├── mocks/              # Test tokens
│   ├── unite_escrow.cairo  # HTLC implementation
│   ├── unite_escrow_factory.cairo
│   ├── unite_limit_order_protocol.cairo
│   └── unite_resolver.cairo
├── scripts/                 # Deployment scripts
├── tests/                   # Test suites
└── target/                  # Compiled contracts
```

### Adding New Features

1. Implement in Cairo contracts
2. Add TypeScript interfaces
3. Write tests
4. Update deployment scripts
5. Test cross-chain integration

## 📚 Resources

- [StarkNet Documentation](https://docs.starknet.io/)
- [Cairo Book](https://book.cairo-lang.org/)
- [Unite Protocol](https://github.com/1inch/unite-contracts)
- [Scarb Documentation](https://docs.swmansion.com/scarb/)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Write tests
4. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.
