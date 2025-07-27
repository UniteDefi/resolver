# Tron <> Base Sepolia HTLC Integration

## Overview
This branch implements cross-chain Hash Time-Locked Contract (HTLC) functionality between Tron (Shasta testnet) and Base Sepolia, enabling trustless atomic swaps as part of the UniteDefi protocol.

## Implementation Status

### ✅ Completed
1. **Project Setup**
   - Created git worktree branch: `tron-integration`
   - Installed TronWeb dependency
   - Configured project structure

2. **Test Suite Implementation**
   - Created comprehensive test file: `test/crosschain/TronBaseHTLC.test.js`
   - Implemented success flow tests
   - Implemented timeout/cancellation flow tests
   - Added resource management tests
   - Included TRX/SUN unit conversion tests

3. **Deployment Scripts**
   - Created `scripts/deploy_tron_contracts.ts` for Tron deployment
   - Created `scripts/deploy_base_contracts.ts` for Base Sepolia deployment
   - Implemented resource checking and management
   - Added deployment artifact saving

4. **Documentation**
   - Created `BLOCKERS_TRON.md` documenting TVM incompatibilities
   - Identified workarounds for all major issues
   - Provided comprehensive next steps

### ⏳ Pending (Requires Manual Steps)
1. **Contract Compilation**
   - Need TronBox installation for TVM-compatible bytecode
   - Alternative: Use Tron-IDE online compiler

2. **Account Funding**
   - Need test TRX from Shasta faucet
   - Need test ETH on Base Sepolia

3. **Integration Testing**
   - Execute actual deployment on testnets
   - Run full HTLC flow with real transactions

## Key Features Implemented

### 1. Cross-Chain HTLC Flow
- **Source Chain (Tron)**: User locks tokens with hashlock
- **Destination Chain (Base)**: Resolver locks equivalent tokens
- **Secret Revelation**: User reveals secret on destination chain
- **Completion**: Resolver claims tokens on source chain using revealed secret

### 2. Resource Management
- Energy and bandwidth tracking for Tron
- Fee estimation and limits
- Resource usage monitoring and warnings

### 3. Safety Features
- Timeout mechanisms for both chains
- Cancellation flow for failed swaps
- Safety deposits to incentivize completion

### 4. Tron-Specific Handling
- Address format conversion (base58 <-> hex)
- Unit conversion (TRX/SUN)
- Energy/bandwidth management
- Tron-specific deployment parameters

## Project Structure
```
tron-integration/
├── test/
│   └── crosschain/
│       └── TronBaseHTLC.test.js      # Comprehensive HTLC test suite
├── scripts/
│   ├── deploy_tron_contracts.ts      # Tron deployment script
│   └── deploy_base_contracts.ts      # Base Sepolia deployment script
├── BLOCKERS_TRON.md                  # TVM compatibility documentation
└── TRON_INTEGRATION_README.md        # This file
```

## Environment Setup

### Required Environment Variables
```bash
# Tron Configuration
TRON_PRIVATE_KEY=your_tron_private_key
TRON_RESOLVER_PRIVATE_KEY=resolver_tron_private_key
TRON_SHASTA_RPC=https://api.shasta.trongrid.io

# Base Sepolia Configuration
BASE_SEPOLIA_PRIVATE_KEY=your_base_private_key
BASE_RESOLVER_PRIVATE_KEY=resolver_base_private_key
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Optional
ALCHEMY_API_KEY=your_alchemy_key
```

### Installation
```bash
# Install dependencies
yarn install

# Install TronBox globally (required for contract compilation)
npm install -g tronbox
```

## Running Tests

### 1. Compile Contracts
```bash
# For Tron (using TronBox)
tronbox compile

# For Base (using Foundry)
forge build
```

### 2. Deploy Contracts
```bash
# Deploy to Tron Shasta
yarn tsx scripts/deploy_tron_contracts.ts

# Deploy to Base Sepolia
yarn tsx scripts/deploy_base_contracts.ts
```

### 3. Run HTLC Tests
```bash
# Run the cross-chain HTLC test
yarn test test/crosschain/TronBaseHTLC.test.js
```

## Key Considerations

### 1. TVM vs EVM Differences
- Energy/Bandwidth model instead of gas
- Different unit system (SUN vs Wei)
- Address format differences
- Contract deployment parameter variations

### 2. Resource Management
- Tron requires Energy for smart contract execution
- Bandwidth for data transmission
- Users can freeze TRX for resources or pay fees

### 3. Testing Recommendations
- Start with small amounts
- Monitor resource consumption
- Test timeout scenarios thoroughly
- Verify cross-chain event monitoring

## Next Steps

1. **Immediate Actions**
   - Install TronBox and compile contracts
   - Get test funds from faucets
   - Run deployment scripts
   - Execute integration tests

2. **Before Production**
   - Optimize resource consumption
   - Implement robust event monitoring
   - Add comprehensive error handling
   - Conduct security audit

3. **Production Considerations**
   - Set up resource delegation
   - Implement fee estimation service
   - Add monitoring and alerting
   - Create user documentation

## Resources
- [Tron Shasta Faucet](https://www.trongrid.io/shasta)
- [Base Sepolia Faucet](https://docs.base.org/docs/tools/network-faucets)
- [TronWeb Documentation](https://tronweb.network/docu/docs/intro/)
- [UniteDefi Cross-Chain Docs](../../command-center/CROSS_CHAIN_RESOLUTION_PROCESS.md)

## Support
For issues or questions:
1. Check `BLOCKERS_TRON.md` for known issues
2. Review test implementation for examples
3. Consult Tron developer documentation
4. Reach out to the UniteDefi team