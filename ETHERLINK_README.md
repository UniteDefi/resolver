# Etherlink <> Base Sepolia HTLC Integration

This directory contains the cross-chain HTLC implementation for Etherlink (Tezos' EVM-compatible L2) and Base Sepolia.

## Network Information

### Etherlink (Ghostnet Testnet)
- **Chain ID**: 128123
- **RPC Endpoint**: https://node.ghostnet.etherlink.com
- **Explorer**: https://ghostnet.explorer.etherlink.com
- **Faucet**: https://faucet.etherlink.com (requires Tezos wallet)

### Base Sepolia
- **Chain ID**: 84532
- **RPC Endpoint**: https://sepolia.base.org
- **Explorer**: https://sepolia.basescan.org
- **Faucet**: https://sepolia-faucet.base.org

## Setup

1. Install dependencies:
   ```bash
   forge install
   ```

2. Set environment variables:
   ```bash
   export PRIVATE_KEY="your-private-key"
   ```

3. Deploy contracts:
   ```bash
   forge script script/crosschain/DeployEtherlinkBase.s.sol --broadcast
   ```

## Running Tests

Run the full test suite:
```bash
forge test --match-contract EtherlinkBaseHTLC -vvv
```

Run specific tests:
```bash
# Full HTLC flow
forge test --match-test test_FullHTLCFlow -vvv

# Timeout scenarios
forge test --match-test test_TimeoutScenario -vvv

# Edge cases
forge test --match-test test_EdgeCases -vvv

# Gas comparison
forge test --match-test test_GasComparison -vvv
```

## Test Scenarios

1. **Full HTLC Flow**: Complete cross-chain swap between Etherlink and Base Sepolia
2. **Timeout Scenario**: Tests refund mechanism when swap times out
3. **Edge Cases**: Tests invalid secret, duplicate HTLC, early cancellation
4. **Gas Comparison**: Compares gas costs between Etherlink and Base

## Contract Addresses

Deployed contracts will be logged during deployment. Update this section after deployment:

### Etherlink
- Token: `<pending>`
- Dutch Auction: `<pending>`
- Escrow Factory: `<pending>`

### Base Sepolia
- Token: `<pending>`
- Escrow Factory: `<pending>`

## Key Features

- **100% EVM Compatible**: Etherlink is fully EVM-compatible, allowing direct deployment of Solidity contracts
- **Lower Fees**: As a Tezos L2, Etherlink offers significantly lower gas fees than Ethereum L2s
- **Fast Finality**: Etherlink provides fast transaction finality
- **Secure**: Inherits security from the Tezos blockchain

## Notes

- Etherlink uses XTZ as its native token (wrapped as ETH in the EVM context)
- Block times on Etherlink are consistent with Tezos (~30 seconds)
- The test suite accounts for Etherlink's specific characteristics