#!/bin/bash

echo "[Build] Building Near contracts..."

# Build main contracts
echo "[Build] Building contracts..."
cargo build --target wasm32-unknown-unknown --release --manifest-path Cargo.toml

echo "[Build] Build complete!"
echo "[Build] Contracts available at:"
echo "  - target/wasm32-unknown-unknown/release/dutch_auction.wasm"
echo "  - target/wasm32-unknown-unknown/release/htlc_escrow.wasm"