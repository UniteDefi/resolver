# StarkNet Unite DeFi Contracts

This directory contains StarkNet smart contracts written in Cairo for the Unite DeFi project.

## Prerequisites

1. **Scarb** - Cairo package manager
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh
   ```

2. **Starkli** (optional) - StarkNet CLI for deployment
   ```bash
   curl https://get.starkli.sh | sh
   ```

3. **Node.js** - For running TypeScript tests and deployment scripts
   ```bash
   # Install Node.js 18+ from https://nodejs.org/
   ```

## Setup

1. Install dependencies:
   ```bash
   yarn install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Configure your `.env` file with:
   - `STARKNET_RPC_URL`: RPC endpoint for testnet
   - `STARKNET_ACCOUNT_ADDRESS`: Your StarkNet account address
   - `STARKNET_PRIVATE_KEY`: Your account's private key

## Building Contracts

```bash
scarb build
```

This will compile the Cairo contracts and generate the necessary artifacts in the `target/` directory.

## Testing

Run the TypeScript tests:

```bash
yarn test
```

For watch mode:
```bash
yarn test:watch
```

## Deployment

### Using TypeScript (starknet.js)

Deploy to testnet:
```bash
yarn deploy:testnet
```

Deploy to mainnet:
```bash
yarn deploy:mainnet
```

### Using Starkli CLI

```bash
./scripts/deploy-cli.sh testnet
# or
./scripts/deploy-cli.sh mainnet
```

## Interacting with Deployed Contracts

Use the interact script:

```bash
# Get current counter value
yarn ts-node scripts/interact.ts get

# Increase counter
yarn ts-node scripts/interact.ts increase

# Decrease counter
yarn ts-node scripts/interact.ts decrease
```

## Contract Overview

### Counter Contract

A simple counter contract demonstrating basic StarkNet functionality:

- `increase_counter()`: Increments the counter by 1
- `decrease_counter()`: Decrements the counter by 1 (with underflow protection)
- `get_counter()`: Returns the current counter value

Events:
- `CounterIncreased`: Emitted when counter is increased
- `CounterDecreased`: Emitted when counter is decreased

## Project Structure

```
starknet/
├── src/
│   ├── lib.cairo         # Main library file
│   └── counter.cairo     # Counter contract implementation
├── tests/
│   └── counter.test.ts   # TypeScript tests
├── scripts/
│   ├── deploy.ts         # Deployment script using starknet.js
│   ├── deploy-cli.sh     # Deployment script using starkli
│   └── interact.ts       # Interaction script
├── Scarb.toml           # Scarb configuration
├── package.json         # Node.js dependencies
├── tsconfig.json        # TypeScript configuration
├── jest.config.js       # Jest test configuration
└── .env.example         # Environment variables template
```

## Troubleshooting

1. **Scarb not found**: Make sure Scarb is installed and in your PATH
2. **Contract compilation fails**: Check Cairo syntax and Scarb.toml configuration
3. **Deployment fails**: Ensure your account has enough ETH for gas fees
4. **Tests fail**: Make sure you have deployed the contract and updated the `.env` file

## Resources

- [StarkNet Documentation](https://docs.starknet.io/)
- [Cairo Book](https://book.cairo-lang.org/)
- [Scarb Documentation](https://docs.swmansion.com/scarb/)
- [starknet.js Documentation](https://www.starknetjs.com/)