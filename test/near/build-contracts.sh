#!/bin/bash

echo "[Build] Building Near contracts separately..."

# Create temp directories
mkdir -p temp_relayer/src
mkdir -p temp_escrow/src

# Build simple_relayer
echo "[Build] Building simple_relayer..."
cp Cargo.toml temp_relayer/
cp src/simple_relayer.rs temp_relayer/src/lib.rs
cd temp_relayer
cargo build --target wasm32-unknown-unknown --release
cd ..
cp temp_relayer/target/wasm32-unknown-unknown/release/unite_near_contracts.wasm target/wasm32-unknown-unknown/release/simple_relayer.wasm

# Build simple_escrow  
echo "[Build] Building simple_escrow..."
cp Cargo.toml temp_escrow/
cp src/simple_escrow.rs temp_escrow/src/lib.rs
cd temp_escrow
cargo build --target wasm32-unknown-unknown --release
cd ..
cp temp_escrow/target/wasm32-unknown-unknown/release/unite_near_contracts.wasm target/wasm32-unknown-unknown/release/simple_escrow.wasm

# Cleanup
rm -rf temp_relayer temp_escrow

echo "[Build] Contracts built successfully!"
echo "[Build] Available at:"
echo "  - target/wasm32-unknown-unknown/release/simple_relayer.wasm"
echo "  - target/wasm32-unknown-unknown/release/simple_escrow.wasm"