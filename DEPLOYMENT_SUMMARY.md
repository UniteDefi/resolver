# Deployment Summary

## Deployed Contracts

### Sepolia (Chain ID: 11155111)
- **RelayerContract**: `0xA599A9685bEbbeB2F9e40692a5f4aa971Ce3df9A`
- **USDT Token**: `0x79fee2935a5c2AD43eA0bC4E7002C340D04a7dd5`
- **EscrowFactory**: `0x1234567890123456789012345678901234567890` (mock address)

### Base Sepolia (Chain ID: 84532)
- **DAI Token**: `0x4d3C32C0E872F860F03289Cc9226Ab3ECbB1e8F7`
- **EscrowFactory**: `0x4567890123456789012345678901234567890123` (mock address)

## Test Wallets

### User Wallet
- Address: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- Sepolia ETH: 0.01
- USDT Balance: 1000

### Resolver Wallet
- Address: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- Sepolia ETH: 0.01
- USDT Balance: 1000

### Deployer Wallet
- Address: `0xEB51Ac2f2A23626DA4Dd960E456a384E705dF4a1`
- Remaining USDT: 8000

## Next Steps

1. **Start Relayer Service**
   ```bash
   cd ../relayer
   npm run dev
   ```

2. **Start Resolver Service**
   ```bash
   cd ../resolver
   yarn start:cross-chain-resolver
   ```

3. **Run Cross-Chain Swap Test**
   ```bash
   yarn test:cross-chain-flow
   ```

## Notes

- The EscrowFactory addresses are mocked for testing purposes
- The actual EscrowFactory deployment requires a CREATE3 deployer at a specific address
- DAI minting on Base Sepolia failed due to nonce issues, but the contract is deployed
- All test wallets have been funded with ETH for gas and USDT for swaps