#!/bin/bash

# Unite-DeFi Protocol Test Suite Runner
# This script runs comprehensive tests for the HTLC implementation

echo "================================================"
echo "Unite-DeFi Protocol Test Suite"
echo "================================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run tests with formatting
run_test_suite() {
    local test_name=$1
    local test_file=$2
    
    echo -e "\n${YELLOW}Running $test_name...${NC}"
    
    if forge test --match-path $test_file -vvv; then
        echo -e "${GREEN} $test_name passed${NC}"
    else
        echo -e "${RED} $test_name failed${NC}"
        exit 1
    fi
}

# Build the project first
echo -e "\n${YELLOW}Building contracts...${NC}"
forge build

# Run individual test suites
echo -e "\n${YELLOW}Starting test execution...${NC}"

# 1. UniteEscrowFactory Tests
run_test_suite "UniteEscrowFactory Tests" "test/UniteEscrowFactory.t.sol"

# 2. HTLC Flow Tests
run_test_suite "HTLC Flow Tests" "test/HTLCFlow.t.sol"

# 3. Security Tests
run_test_suite "Security Tests" "test/SecurityTests.t.sol"

# 4. Integration Tests
run_test_suite "Integration Tests" "test/IntegrationTests.t.sol"

# Run all tests with coverage
echo -e "\n${YELLOW}Running coverage analysis...${NC}"
forge coverage --report lcov --report summary

# Run gas report
echo -e "\n${YELLOW}Generating gas report...${NC}"
forge test --gas-report

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}All tests passed successfully!${NC}"
echo -e "${GREEN}================================================${NC}"

# Optional: Run specific scenario tests
if [ "$1" = "--scenarios" ]; then
    echo -e "\n${YELLOW}Running specific scenario tests...${NC}"
    
    # Test timeout scenarios
    forge test --match-test "test_timeout" -vvv
    
    # Test rescue scenarios
    forge test --match-test "test_rescue" -vvv
    
    # Test security scenarios
    forge test --match-test "test_reentrancy|test_unauthorized" -vvv
fi

# Optional: Run with different chain forks
if [ "$1" = "--fork" ]; then
    echo -e "\n${YELLOW}Running fork tests...${NC}"
    
    # Ethereum mainnet fork
    forge test --fork-url $ETH_RPC_URL --fork-block-number 18000000 -vvv
    
    # Polygon fork
    forge test --fork-url $POLYGON_RPC_URL --fork-block-number 50000000 -vvv
fi