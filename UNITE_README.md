# UniteDefi Cross-Chain Resolver

Dutch auction-based cross-chain swap protocol built on 1inch Fusion+ model.

## Progress

### ✅ Completed
- Created template branch with original 1inch example
- Implemented DutchAuction.sol with linear price decrease
- Created UniteResolver.sol extending base Resolver
- Added multi-chain support (Ethereum, Polygon, Base, Arbitrum)
- Written foundry tests for DutchAuction
- Created TypeScript integration tests
- **Deployed SimpleDutchAuction to all testnets** ✨

### 📍 Deployed Contracts

| Network | Address | Explorer |
|---------|---------|----------|
| Ethereum Sepolia | `0x66AEACCcF67b99E96831f60F821377010aF9B763` | [View](https://sepolia.etherscan.io/address/0x66AEACCcF67b99E96831f60F821377010aF9B763) |
| Base Sepolia | `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9` | [View](https://sepolia.basescan.org/address/0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9) |
| Polygon Amoy | `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9` | [View](https://amoy.polygonscan.com/address/0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9) |
| Arbitrum Sepolia | `0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9` | [View](https://sepolia.arbiscan.io/address/0x58B1D7d9011235E14C1FF4033875f0fEdA46fDE9) |

Deployer: `0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35`

### 🚧 TODO
1. **Deploy UniteResolver**
   - Fix dependencies for complex resolver
   - Deploy to all chains
   
2. **Contract Verification**
   - Verify on block explorers
   - Create interaction examples

3. **Integration Testing**
   - Test auction creation/settlement
   - Test cross-chain flows

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