# Unite-DeFi Protocol Test Suite

Comprehensive Foundry test suite for the Unite-DeFi HTLC cross-chain swap protocol.

## Test Structure

### 1. BaseTest.sol
Base test contract with common setup and utilities:
- Mock token deployments
- Test account setup
- Helper functions for order creation
- EIP-712 signature utilities

### 2. UniteEscrowFactory.t.sol
Tests for the UniteEscrowFactory contract:
- Relayer authorization/revocation
- User fund transfers
- Access control
- Edge cases and error scenarios

### 3. HTLCFlow.t.sol
Complete HTLC flow tests covering all 10 steps:
- Full happy path swap execution
- Timeout scenarios
- Alternative resolver rescue
- Invalid secret handling

### 4. SecurityTests.t.sol
Security-focused tests:
- Reentrancy protection
- Unauthorized access prevention
- Overflow/underflow protection
- Front-running scenarios
- Malicious token handling
- Zero address protection
- Griefing attack prevention
- Race condition handling

### 5. IntegrationTests.t.sol
Integration and advanced scenarios:
- EIP-712 signature integration
- Multiple concurrent swaps
- Cross-chain message simulation
- Gas optimization tests
- Partial fill scenarios

## Running Tests

### All Tests
```bash
forge test
```

### Specific Test File
```bash
forge test --match-path test/HTLCFlow.t.sol -vvv
```

### Specific Test Function
```bash
forge test --match-test test_completeHTLCFlow -vvv
```

### With Gas Report
```bash
forge test --gas-report
```

### With Coverage
```bash
forge coverage
```

### Using Test Runner Script
```bash
./run_tests.sh              # Run all tests
./run_tests.sh --scenarios  # Run specific scenarios
./run_tests.sh --fork       # Run with chain forks
```

## Test Coverage

The test suite covers:
-  All 10 steps of the HTLC flow from FLOW.md
-  Relayer authorization and access control
-  User fund transfers and approvals
-  Escrow deployment and interactions
-  Secret reveal and withdrawal mechanics
-  Timeout and rescue scenarios
-  Security vulnerabilities and attack vectors
-  Gas optimization considerations
-  Multiple concurrent swaps
-  Edge cases and error conditions

## Key Test Scenarios

### Happy Path
1. User approves UniteEscrowFactory
2. Order creation with EIP-712 signature
3. Resolver commits to order
4. Escrow contracts deployed on both chains
5. User funds transferred to source escrow
6. Resolver deposits in destination escrow
7. Secret revealed on destination chain
8. Both parties withdraw successfully

### Timeout Recovery
- Resolver fails to complete within 5 minutes
- User can cancel and recover funds
- User receives safety deposit as penalty

### Alternative Resolver Rescue
- Original resolver fails
- Another resolver completes the swap
- Alternative resolver claims safety deposits

### Security Scenarios
- Reentrancy attacks blocked
- Unauthorized access prevented
- Malicious tokens handled safely
- Front-running protection verified

## Environment Variables

For fork testing, set:
```bash
export ETH_RPC_URL="your_ethereum_rpc_url"
export POLYGON_RPC_URL="your_polygon_rpc_url"
```

## Debugging Tips

1. Use `-vvvv` for maximum verbosity
2. Check console.log outputs in tests
3. Use `forge test --debug` for step-by-step debugging
4. Run individual tests to isolate issues

## Gas Optimization

Monitor gas usage with:
```bash
forge test --gas-report | grep transferUserFundsToEscrow
```

Target gas costs:
- transferUserFundsToEscrow: < 100,000 gas
- authorizeRelayer: < 50,000 gas
- createDstEscrow: < 200,000 gas