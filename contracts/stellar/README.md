# Stellar Soroban Counter Contract

A simple counter smart contract for Stellar's Soroban platform, written in Rust with TypeScript testing and deployment scripts.

## Prerequisites

1. **Rust & Cargo**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add wasm32-unknown-unknown
   ```

2. **Soroban CLI**
   ```bash
   cargo install --locked soroban-cli
   ```

3. **Node.js & Yarn**
   ```bash
   # Install Node.js 18+ and Yarn
   ```

## Setup

1. **Install dependencies**
   ```bash
   yarn install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your STELLAR_SECRET_KEY
   ```

3. **Generate a Stellar keypair (for testnet)**
   ```bash
   # Visit https://laboratory.stellar.org/#account-creator
   # Or use Soroban CLI:
   soroban keys generate --global my-key --network testnet
   ```

## Building

```bash
# Build the contract
cargo build --target wasm32-unknown-unknown --release

# Or use the npm script
yarn build:contract
```

## Testing

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch
```

## Deployment

### Deploy to Testnet
```bash
yarn deploy:testnet
```

### Deploy to Local Network
```bash
# Start local Stellar network first
docker run --rm -it -p 8000:8000 --name stellar stellar/quickstart:soroban-dev --standalone

# Deploy
yarn deploy:local
```

## Interacting with the Contract

After deployment, use the interact script:

```bash
# Get current count
yarn ts-node scripts/interact.ts --network=testnet --action=get_count

# Increment counter
yarn ts-node scripts/interact.ts --network=testnet --action=increment

# Decrement counter
yarn ts-node scripts/interact.ts --network=testnet --action=decrement

# Run demo sequence
yarn ts-node scripts/interact.ts --network=testnet --action=demo
```

## Contract Methods

- `get_count()` - Returns the current counter value (u32)
- `increment()` - Increments the counter and returns new value
- `decrement()` - Decrements the counter (minimum 0) and returns new value

## Using Soroban CLI Directly

```bash
# Deploy contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/counter.wasm \
  --source YOUR_SECRET_KEY \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Invoke methods
soroban contract invoke \
  --id CONTRACT_ID \
  --source YOUR_SECRET_KEY \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  get_count
```

## Project Structure

```
contracts/stellar/
├── Cargo.toml           # Rust dependencies
├── src/
│   └── lib.rs          # Counter contract implementation
├── tests/
│   ├── counter.test.ts         # Basic TypeScript tests
│   └── counter-local.test.ts   # Local network tests
├── scripts/
│   ├── deploy.ts       # Deployment script
│   └── interact.ts     # Interaction script
├── package.json        # Node dependencies
├── tsconfig.json       # TypeScript configuration
└── .env.example        # Environment variables template
```

## Resources

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar Laboratory](https://laboratory.stellar.org/)
- [Soroban Examples](https://github.com/stellar/soroban-examples)