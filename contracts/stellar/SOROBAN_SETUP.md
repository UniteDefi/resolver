# Soroban CLI Setup & Deployment Guide

## Install Soroban CLI

```bash
# Install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Soroban CLI
cargo install --locked soroban-cli --features opt

# Verify installation
soroban --version
```

## Deploy Counter Contract

Your wallet details:
- Public Key: `GABMJQZFSEXOGCX5KDZGCQXSAM4YYIDWTBSOPU5GPWBJDYH4RLT7KCEY`
- Secret Key: Already in your `.env` file
- Balance: 10,000 XLM on testnet

### Option 1: Use the deployment script
```bash
# Deploy to testnet
yarn deploy:testnet

# Or use the shell script
./deploy.sh testnet
```

### Option 2: Manual deployment with Soroban CLI

```bash
# 1. Build the contract
cargo build --target wasm32-unknown-unknown --release

# 2. Deploy to testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/counter.wasm \
  --source SAKGIZT7OSGTRGS55ZSZPWLISCTXQPGH6VT7LOWYPANBNXEF6HIC3WJO \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# This will output your CONTRACT_ID
```

### Interact with the deployed contract

```bash
# Get current count
soroban contract invoke \
  --id YOUR_CONTRACT_ID \
  --source SAKGIZT7OSGTRGS55ZSZPWLISCTXQPGH6VT7LOWYPANBNXEF6HIC3WJO \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  get_count

# Increment
soroban contract invoke \
  --id YOUR_CONTRACT_ID \
  --source SAKGIZT7OSGTRGS55ZSZPWLISCTXQPGH6VT7LOWYPANBNXEF6HIC3WJO \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  increment

# Decrement
soroban contract invoke \
  --id YOUR_CONTRACT_ID \
  --source SAKGIZT7OSGTRGS55ZSZPWLISCTXQPGH6VT7LOWYPANBNXEF6HIC3WJO \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  decrement
```

## Alternative: Use Stellar Laboratory

You can also deploy and interact with contracts using the Stellar Laboratory:
https://laboratory.stellar.org/

## Check Account Balance

View your account on the testnet explorer:
https://stellar.expert/explorer/testnet/account/GABMJQZFSEXOGCX5KDZGCQXSAM4YYIDWTBSOPU5GPWBJDYH4RLT7KCEY