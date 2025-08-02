#!/bin/bash

echo "Setting up Cardano Cross-Chain HTLC environment..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Copy environment file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file - please update with your actual credentials"
fi

# Create directories
mkdir -p validators
mkdir -p test
mkdir -p dist

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your credentials"
echo "2. Run 'npm run compile:validators' to compile Aiken contracts"
echo "3. Run 'npm run test:crosschain' to run cross-chain tests"
echo "4. Run 'npm run deploy:testnet' to deploy to testnet"
