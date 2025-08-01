# Neutron Smart Contracts

A CosmWasm-based smart contract development environment for Neutron blockchain, featuring a basic counter contract with TypeScript testing infrastructure.

## Project Structure

```
contracts/neutron/
├── contracts/
│   └── counter/           # Counter smart contract in Rust
├── scripts/               # Deployment and interaction scripts
├── tests/                 # TypeScript testing environment
├── Cargo.toml            # Rust workspace configuration
├── Makefile              # Build and deployment commands
└── README.md
```

## Prerequisites

- Rust (latest stable)
- Node.js and Yarn
- Docker (for optimized builds)

## Quick Start

### 1. Setup Environment

```bash
# Install Rust WASM target
make install-wasm-target

# Install TypeScript dependencies
make install-deps

# Complete setup
make setup
```

### 2. Generate Wallet

```bash
cd tests
yarn node generate-wallet.js
```

**Generated Wallet Address:** `neutron1teueqwmfc5qln9plsgddq7rvhswc3hqxte8n5m`

**Fund this address at:** https://faucet.pion-1.ntrn.tech/

### 3. Build Contract

```bash
make build
```

### 4. Deploy Contract

```bash
export MNEMONIC="your-mnemonic-here"
make deploy
```

### 5. Interact with Contract

```bash
make interact
```

## Contract Features

### Counter Contract

- **Increment**: Increase counter by 1
- **Decrement**: Decrease counter by 1  
- **Reset**: Set counter to specific value (owner only)
- **Query**: Get current counter value

## Testing

### Rust Tests

```bash
make test-rust
```

### TypeScript Integration Tests

```bash
# Requires deployed contract
make test-ts
```

## Development Workflow

```bash
# Build and test
make dev

# Clean artifacts
make clean

# Generate schema
make schema

# Optimize for production
make optimize
```

## Environment Variables

```bash
export MNEMONIC="survey omit calm orchard genius execute twist addict mixed medal eternal promote stumble glass adult since bridge talent icon raise danger poem music beyond"
export NEUTRON_ADDRESS="neutron1teueqwmfc5qln9plsgddq7rvhswc3hqxte8n5m"
export RPC_ENDPOINT="https://rpc-falcron.pion-1.ntrn.tech"
export INITIAL_COUNT="0"
```

## Network Configuration

- **Network**: Neutron Testnet (pion-1)
- **RPC**: https://rpc-falcron.pion-1.ntrn.tech
- **Faucet**: https://faucet.pion-1.ntrn.tech/
- **Explorer**: https://explorer.pion-1.ntrn.tech/

## Deployment Info

Deployments are saved to `deployments.json` with:
- Contract address
- Code ID
- Deployer address
- Network info
- Timestamp

## Security Notes

⚠️ **IMPORTANT**: This is for testnet development only
- Never use mainnet mnemonics in development
- Store mnemonics securely offline
- Fund testnet addresses before deployment
- Neutron supports permissionless smart contract deployment