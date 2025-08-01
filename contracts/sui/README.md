# Sui Counter Example

A basic Sui Move project demonstrating object creation and interaction.

## Setup

1. Install Sui CLI:
```bash
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui
```

2. Install dependencies:
```bash
yarn install
```

3. Configure environment:
```bash
cp .env.example .env
# Add your private key to .env
```

## Build & Deploy

```bash
# Build Move package
yarn build

# Deploy to network
yarn deploy
```

## Testing

```bash
yarn test
```

## Project Structure

- `sources/` - Move source code
- `tests/` - TypeScript integration tests
- `scripts/` - Deployment scripts
- `Move.toml` - Move package configuration