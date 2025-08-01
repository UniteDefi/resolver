#!/bin/bash

echo "[Build] Starting Aiken build process..."

# Check if aiken is installed
if ! command -v aiken &> /dev/null; then
    echo "[Build] Error: Aiken CLI is not installed."
    echo "[Build] Please install Aiken from: https://aiken-lang.org/installation-instructions"
    exit 1
fi

# Build the Aiken project
echo "[Build] Running 'aiken build'..."
aiken build

if [ $? -eq 0 ]; then
    echo "[Build] Build successful!"
    echo "[Build] Validator compiled to plutus.json"
    
    # Check if plutus.json exists
    if [ -f "plutus.json" ]; then
        echo "[Build] Validators found in plutus.json:"
        cat plutus.json | jq '.validators[].title'
    fi
else
    echo "[Build] Build failed!"
    exit 1
fi