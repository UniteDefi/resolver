# UniteDefi Cross-Chain Resolver

Dutch auction-based cross-chain swap protocol built on 1inch Fusion+ model.

## Progress

### ✅ Completed
- Created template branch with original 1inch example
- Implemented DutchAuction.sol with linear price decrease
- Created UniteResolver.sol extending base Resolver
- Added multi-chain support (Ethereum, Polygon, BSC, Arbitrum)
- Written foundry tests for DutchAuction
- Created TypeScript integration tests

### 🚧 TODO
1. **Fix Foundry Dependencies**
   - Install OpenZeppelin and other dependencies properly
   - Run: `forge install OpenZeppelin/openzeppelin-contracts`
   - Run: `forge install 1inch/limit-order-protocol`
   
2. **Complete Testing**
   - Fix compilation issues
   - Run tests on all 4 chains
   - Verify cross-chain functionality

3. **Deploy Contracts**
   - Deploy DutchAuction on each chain
   - Deploy UniteResolver on each chain
   - Verify contracts on explorers

4. **API Development** (if time permits)
   - REST endpoints for auction creation
   - Price query endpoints
   - Settlement endpoints

## Quick Start

```bash
# Install dependencies
pnpm install
forge install

# Run tests
ETH_RPC=<your-eth-rpc> BSC_RPC=<your-bsc-rpc> POLYGON_RPC=<your-polygon-rpc> ARBITRUM_RPC=<your-arbitrum-rpc> pnpm test

# Run foundry tests (after fixing dependencies)
forge test
```

## Architecture

- **DutchAuction.sol**: Core auction logic with linear price decrease
- **UniteResolver.sol**: Extends 1inch Resolver for auction integration
- **Multi-chain**: Supports Ethereum, Polygon, BSC, and Arbitrum
- **Safety Deposits**: 0.01 ETH equivalent on each chain

## Key Features

- Linear dutch auction pricing model
- Cross-chain swap support via 1inch infrastructure
- Minimal safety deposits (0.01 ETH equivalent)
- Support for 4 major EVM chains