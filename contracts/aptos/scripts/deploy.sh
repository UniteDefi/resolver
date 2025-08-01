#!/bin/bash

# Deployment script using Aptos CLI

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}[Deploy] Starting Aptos deployment...${NC}"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if private key is set
if [ -z "$APTOS_PRIVATE_KEY" ]; then
    echo -e "${RED}[Deploy] Error: APTOS_PRIVATE_KEY not found in .env${NC}"
    exit 1
fi

# Set network (default to devnet)
NETWORK=${APTOS_NETWORK:-devnet}
echo -e "${GREEN}[Deploy] Network: $NETWORK${NC}"

# Update Move.toml with address (this will be done by the TypeScript script)
# For now, just compile with placeholder

# Compile the Move module
echo -e "${GREEN}[Deploy] Compiling Move module...${NC}"
aptos move compile

if [ $? -ne 0 ]; then
    echo -e "${RED}[Deploy] Compilation failed${NC}"
    exit 1
fi

# Run the TypeScript deployment script
echo -e "${GREEN}[Deploy] Running deployment script...${NC}"
yarn deploy

echo -e "${GREEN}[Deploy] Deployment complete!${NC}"