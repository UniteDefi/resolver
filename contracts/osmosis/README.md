# Unite Osmosis Contracts

Cross-chain swap smart contracts for Osmosis blockchain. Supports bi-directional swaps with EVM chains using Dutch auction pricing and HTLC mechanisms.

## Quick Start

```bash
# 1. Install dependencies
yarn install

# 2. Build contracts  
cargo build --release --target wasm32-unknown-unknown

# 3. Deploy all contracts
npm run deploy:all

# 4. Fund test wallets
npm run fund:all

# 5. Run complete test suite
npm test
```

## Scripts

### Core Scripts
- `npm run deploy:all` - Deploy all contracts to testnet
- `npm run fund:all` - Fund all wallets with OSMO and test tokens
- `npm run check:all` - Check wallet balances and readiness
- `npm test` - Run complete cross-chain test flow

### Build & Development  
- `npm run build` - Build all WASM contracts
- `npm run clean` - Clean build artifacts
- `npm run check` - Run cargo checks
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Local Development
- `npm run start:local` - Start local Osmosis node (Docker)
- `npm run stop:local` - Stop local node
- `npm run setup:wallet` - Generate new test wallet

## Environment Setup

Create `.env` file:

```bash
# Osmosis Testnet
OSMO_TESTNET_RPC=https://rpc.testnet.osmosis.zone
OSMO_TESTNET_MNEMONIC="your deployer mnemonic"

# Test Wallets
OSMO_USER_MNEMONIC="user wallet mnemonic"
OSMO_RESOLVER_MNEMONIC_0="resolver 0 mnemonic"
OSMO_RESOLVER_MNEMONIC_1="resolver 1 mnemonic" 
OSMO_RESOLVER_MNEMONIC_2="resolver 2 mnemonic"

# Optional: Funding configuration
FUND_TARGETS=all
FUND_AMOUNT=5000000
TOKEN_AMOUNT=10000000000
```

## Contract Architecture

### Core Contracts
- **UniteOrderProtocol** - Cross-chain order hash generation
- **UniteEscrowFactory** - Factory for deploying escrow instances
- **UniteEscrow** - HTLC escrow with partial fills
- **UniteResolver** - Dutch auction integration and order filling
- **TestToken** - ERC20-like test token (TUSDT)

### Key Features
- ✅ Cross-chain order hash consistency (EVM ↔ Osmosis)
- ✅ Dutch auction pricing with linear decay
- ✅ Partial fills supporting multiple resolvers
- ✅ HTLC atomic swaps with time locks
- ✅ Constant safety deposits per resolver
- ✅ Bi-directional swap support

## Testing

Single comprehensive test file matches EVM structure:

```bash
# Run complete flow test
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Test covers:
- Contract deployment verification
- Wallet balance checks
- Order creation and signing
- Multi-resolver partial fills
- Dutch auction price calculation
- HTLC secret revelation
- Cross-chain withdrawal simulation

## Deployment Structure

Contracts deploy in this order:
1. Test Token (TUSDT)
2. Order Protocol
3. Escrow Code (stored)
4. Escrow Factory
5. Resolver Contracts (0, 1, 2)

Results saved to `deployments.json` in EVM-compatible format.

## Troubleshooting

### Common Issues

**"WASM files not found"**
```bash
cargo build --release --target wasm32-unknown-unknown
```

**"Insufficient balance"**
- Get testnet OSMO: https://faucet.testnet.osmosis.zone/
- Check balances: `npm run check:all`

**"deployments.json not found"**
```bash
npm run deploy:all
```

**"Mnemonic not set"**
- Check all required mnemonics in `.env`
- Generate new wallet: `npm run setup:wallet`

### Gas Issues
- Default gas price: 0.025uosmo
- Increase if transactions fail
- Check deployer has >10 OSMO

### Network Issues
- Default RPC: https://rpc.testnet.osmosis.zone
- Try alternative RPC if connection fails
- Check Osmosis testnet status

## Cross-Chain Integration

### Order Hash Compatibility
- Uses deterministic address normalization
- SHA256 hashing for consistency
- Supports Osmosis ↔ EVM mapping

### Safety Deposits
- **Constant** amount per resolver (not proportional)
- Default: 0.01 OSMO per resolver
- Returned on successful completion

### Dutch Auction
- Linear price decay over time
- Start price > End price
- Real-time price calculation in fillOrder

## Links

- **Osmosis Testnet Explorer**: https://testnet.mintscan.io/osmosis-testnet
- **Testnet Faucet**: https://faucet.testnet.osmosis.zone/
- **CosmWasm Docs**: https://docs.cosmwasm.com/
- **Osmosis Docs**: https://docs.osmosis.zone/

## License

MIT
