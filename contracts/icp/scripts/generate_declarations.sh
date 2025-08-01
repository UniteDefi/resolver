#!/bin/bash

# Generate TypeScript declarations for the counter canister
echo "Generating TypeScript declarations for counter canister..."

# Create declarations directory if it doesn't exist
mkdir -p src/declarations/counter

# Generate candid interface
dfx generate counter

echo "TypeScript declarations generated successfully!"