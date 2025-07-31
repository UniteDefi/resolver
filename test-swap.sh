#!/bin/bash

# Unite DeFi Cross-Chain Swap Testing Script

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Unite DeFi Cross-Chain Swap Testing ===${NC}\n"

# Change to scripts directory
cd scripts/

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Display usage
echo -e "${GREEN}Quick Start Commands:${NC}\n"

echo "1. Fund your test wallet:"
echo -e "   ${YELLOW}npm run fund-user -- --chain eth_sepolia${NC}"
echo ""

echo "2. Check balances across all chains:"
echo -e "   ${YELLOW}npm run check-balances${NC}"
echo ""

echo "3. Execute a cross-chain swap:"
echo -e "   ${YELLOW}npm run test-swap -- --from eth_sepolia --to base_sepolia --token USDT --amount 100${NC}"
echo ""

echo -e "${GREEN}Supported Chains:${NC}"
echo "  - eth_sepolia    (Ethereum Sepolia)"
echo "  - base_sepolia   (Base Sepolia)"
echo "  - arb_sepolia    (Arbitrum Sepolia)"
echo "  - monad_testnet  (Monad Testnet)"
echo ""

echo -e "${GREEN}Supported Tokens:${NC}"
echo "  - USDT (6 decimals)"
echo "  - DAI  (18 decimals)"
echo "  - WETH (18 decimals)"
echo ""

echo -e "${BLUE}Example Full Flow:${NC}"
echo "npm run fund-user -- --chain eth_sepolia --usdt 1000"
echo "npm run test-swap -- --from eth_sepolia --to base_sepolia --token USDT --amount 100"
echo ""

# Check if services are running
echo -e "${YELLOW}Service Status:${NC}"
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Relayer API is running on port 3000"
else
    echo -e "  ${RED}✗${NC} Relayer API is NOT running"
    echo -e "    Start with: ${YELLOW}cd ../relayer && npm run dev${NC}"
fi

# Check for resolver services (they might be on various ports)
RESOLVER_RUNNING=false
for port in {3002..3010}; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        RESOLVER_RUNNING=true
        break
    fi
done

if [ "$RESOLVER_RUNNING" = true ]; then
    echo -e "  ${GREEN}✓${NC} At least one resolver service detected"
else
    echo -e "  ${YELLOW}?${NC} No resolver services detected (they may be using SQS directly)"
fi

echo ""
echo -e "${GREEN}Ready to test!${NC} Use the commands above to start testing cross-chain swaps."