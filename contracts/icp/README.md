# Unite DeFi ICP Smart Contracts

This directory contains the Internet Computer Protocol (ICP) implementation of the Unite DeFi cross-chain swap protocol. The contracts enable secure, trustless swaps between ICP and EVM-compatible chains using Hash Time Locked Contracts (HTLCs) and Dutch auction pricing.

## Prerequisites

- [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install) - The DFINITY Canister SDK
- Node.js v16 or higher
- yarn package manager

## Quick Start

```bash
# Install dependencies
yarn install

# Deploy all contracts and setup environment
yarn setup

# Run tests
yarn test
```

## Manual Setup

If you prefer to run the scripts individually:

```bash
# 1. Deploy all contracts
./scripts/DeployAll.sh

# 2. Fund test wallets with cycles
./scripts/FundWallets.sh

# 3. Mint test tokens to wallets
./scripts/MintTokens.sh

# 4. Run tests
yarn test
```

## Architecture

### Core Contracts

1. **UniteLimitOrderProtocol** - Main order protocol with Dutch auction support
2. **UniteEscrowFactory** - Factory for creating deterministic escrow addresses
3. **UniteEscrow** - HTLC escrow contract for holding funds during swaps
4. **UniteResolver** - Bridge component that orchestrates cross-chain operations
5. **MockToken** - ICRC-1/ICRC-2 compliant test tokens (USDT, DAI)

### Key Features

- **Dutch Auction Pricing**: Linear price decay from premium to fair value
- **Partial Fill Support**: Multiple resolvers can fill portions of large orders  
- **HTLC Security**: Secret-based fund release with timelock fallbacks
- **Cycles Management**: Proper safety deposits and gas handling
- **Cross-Chain Compatibility**: Designed to work with EVM implementations

## Swap Flows

### ICP → EVM Swap
1. User creates order on ICP with USDT as source asset
2. Resolver fills order and creates source escrow on ICP
3. Resolver creates destination escrow on EVM with DAI
4. User reveals secret on EVM to receive DAI
5. Resolver uses revealed secret to claim USDT on ICP

### EVM → ICP Swap  
1. User creates order on EVM with DAI as source asset
2. Resolver fills order and creates source escrow on EVM
3. Resolver fills order on ICP using Dutch auction pricing
4. User reveals secret on ICP to receive USDT
5. Resolver uses revealed secret to claim DAI on EVM

## Environment Variables

The scripts support the following environment variables:

```bash
# Funding configuration
FUND_TARGETS="all"  # or "user,resolver0,resolver1"
FUND_AMOUNT="10000000000000"  # cycles to send to each wallet
```

## Generated Files

After deployment, the following files are created:

- `deployments.json` - Contract addresses and metadata
- `wallets.json` - Test wallet principals and information

## Testing

The test suite covers:

- Full ICP ↔ EVM swap flows
- Dutch auction price calculations
- Partial fill scenarios
- Order expiration handling
- HTLC secret revelation
- Error cases and edge conditions

Run with:
```bash
yarn test
```

## Critical Implementation Notes

✅ **Hash Function Usage**: The ICP implementation uses SHA256 while EVM uses keccak256. This is perfectly acceptable since cross-chain correlation is achieved through order salts and off-chain indexing, not hash matching.

⚠️ **Signature Verification**: Currently simplified for testing. Production deployment requires proper signature verification implementation.

## Scripts Reference

### DeployAll.sh
- Deploys all Unite DeFi contracts to local ICP network
- Creates `deployments.json` with contract addresses
- Requires sufficient cycles in deployer wallet

### FundWallets.sh  
- Creates test identities: unite-user, unite-resolver0-3
- Creates cycles wallets for each identity
- Funds wallets with configurable amount of cycles
- Creates `wallets.json` with principal information

### MintTokens.sh
- Mints test tokens (USDT, DAI) to all test wallets
- 10,000 tokens per wallet for testing
- Verifies balances after minting

## Development

The contracts are written in Motoko and use the actor model for safe concurrency. Key libraries:

- **Types**: Common type definitions
- **DutchAuctionLib**: Time-based price calculations  
- **UniteOrderLib**: Order hashing and verification
- **MockToken**: ICRC-1/ICRC-2 token implementation

## Network Support

Currently configured for:
- **Local**: ICP local development network
- **Testnet**: ICP testnet (configuration ready)
- **Mainnet**: ICP mainnet (configuration ready)

## Security Considerations

- Reentrancy protection via ICP's actor model
- Integer overflow protection via Motoko
- Proper access control and owner management
- Time-based validation using ICP's reliable time source
- Cycle exhaustion protection

## Project Structure

```
contracts/icp/
├── src/unite/
│   ├── UniteLimitOrderProtocol.mo    # Main order protocol
│   ├── UniteEscrowFactory.mo         # Escrow factory
│   ├── UniteEscrow.mo                # HTLC escrow contract
│   ├── UniteResolver.mo              # Cross-chain resolver
│   ├── MockToken.mo                  # ICRC-1/2 test tokens
│   ├── DutchAuctionLib.mo           # Auction pricing
│   ├── UniteOrderLib.mo             # Order utilities
│   └── types.mo                     # Type definitions
├── tests/
│   └── icp-evm-cross-chain.test.ts # Integration tests
├── scripts/
│   ├── DeployAll.sh                 # Deploy all contracts
│   ├── FundWallets.sh              # Fund test wallets
│   └── MintTokens.sh               # Mint test tokens
├── dfx.json                        # DFX configuration
├── package.json                    # Dependencies
└── README.md                       # This file
```

## Contributing

1. Ensure all tests pass: `yarn test`
2. Follow Motoko coding conventions
3. Update tests for new functionality
4. Document any breaking changes

## License

MIT