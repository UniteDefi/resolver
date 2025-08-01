#!/bin/bash

echo "[Dev Deploy] Building contract..."
cargo build --target wasm32-unknown-unknown --release

echo "[Dev Deploy] Deploying to dev account..."
near dev-deploy target/wasm32-unknown-unknown/release/counter.wasm

echo "[Dev Deploy] Setting CONTRACT_NAME environment variable..."
source neardev/dev-account.env
echo "export CONTRACT_NAME=$CONTRACT_NAME"

echo "[Dev Deploy] Contract deployed to: $CONTRACT_NAME"
echo "[Dev Deploy] You can now interact with the contract using:"
echo "  near call $CONTRACT_NAME increment"
echo "  near call $CONTRACT_NAME decrement"
echo "  near view $CONTRACT_NAME get_value"
echo "  near call $CONTRACT_NAME reset"