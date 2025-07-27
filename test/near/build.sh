#!/bin/bash

echo "[Build] Building Near contracts..."

# Build main contracts
echo "[Build] Building dutch_auction contract..."
cargo build --target wasm32-unknown-unknown --release --manifest-path Cargo.toml

# Build test token
echo "[Build] Building test token contract..."
cargo build --target wasm32-unknown-unknown --release --manifest-path test-token/Cargo.toml

# Copy test token to expected location
echo "[Build] Copying test token to target directory..."
cp test-token/target/wasm32-unknown-unknown/release/test_token.wasm target/wasm32-unknown-unknown/release/

echo "[Build] Build complete!"
echo "[Build] Contracts available at:"
echo "  - target/wasm32-unknown-unknown/release/dutch_auction.wasm"
echo "  - target/wasm32-unknown-unknown/release/htlc_escrow.wasm"
echo "  - target/wasm32-unknown-unknown/release/test_token.wasm"