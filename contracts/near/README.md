# NEAR Counter Contract

A simple counter smart contract built with NEAR SDK and Rust.

## Setup

1. Install dependencies:
```bash
# Install Rust and wasm32 target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Install Node.js dependencies
yarn install

# Install NEAR CLI globally
npm install -g near-cli
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your NEAR account details
```

## Build

```bash
yarn build
```

## Testing

```bash
yarn test
```

## Deployment

### Dev Deploy (creates temporary dev account)
```bash
yarn dev-deploy
```

### Production Deploy
```bash
yarn deploy
```

## Interact with Contract

Using the interact script:
```bash
# Increment counter
yarn interact increment

# Decrement counter
yarn interact decrement

# Get current value
yarn interact get

# Reset counter
yarn interact reset
```

Using NEAR CLI directly:
```bash
# View methods (no gas required)
near view <CONTRACT_NAME> get_value

# Change methods (requires gas)
near call <CONTRACT_NAME> increment --accountId <YOUR_ACCOUNT>
near call <CONTRACT_NAME> decrement --accountId <YOUR_ACCOUNT>
near call <CONTRACT_NAME> reset --accountId <YOUR_ACCOUNT>
```

## Contract Methods

- `increment()` - Increases counter by 1
- `decrement()` - Decreases counter by 1 (panics if counter is 0)
- `get_value()` - Returns current counter value
- `reset()` - Resets counter to 0