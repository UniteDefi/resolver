#!/bin/bash

# EOS Account Creation Script
# This script creates test accounts for local development

# Default endpoint
ENDPOINT=${EOS_RPC_ENDPOINT:-http://127.0.0.1:8888}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Creating EOS test accounts...${NC}"

# Function to create account
create_account() {
    local creator=$1
    local account=$2
    local pubkey=$3
    
    echo -e "${GREEN}Creating account: ${account}${NC}"
    
    cleos -u $ENDPOINT create account $creator $account $pubkey $pubkey
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Account ${account} created successfully${NC}"
    else
        echo -e "${RED}✗ Failed to create account ${account}${NC}"
        return 1
    fi
}

# Default public key for development (corresponds to the default private key)
DEFAULT_PUBKEY="EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV"

# Create contract account
create_account eosio counter $DEFAULT_PUBKEY

# Create test accounts
create_account eosio alice $DEFAULT_PUBKEY
create_account eosio bob $DEFAULT_PUBKEY

# Create additional test accounts if needed
create_account eosio charlie $DEFAULT_PUBKEY
create_account eosio david $DEFAULT_PUBKEY

echo -e "${GREEN}Account creation completed!${NC}"

# List created accounts
echo -e "${YELLOW}Verifying accounts...${NC}"
cleos -u $ENDPOINT get accounts $DEFAULT_PUBKEY