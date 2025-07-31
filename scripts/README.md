# Unite DeFi Cross-Chain Swap Testing Scripts

This directory contains scripts to test the complete cross-chain swap flow according to FLOW.md.

## Setup

1. Install dependencies:
```bash
cd resolver/scripts/
npm install
```

2. Ensure the following services are running:
   - Relayer service: `cd relayer/ && npm run dev`
   - 4 Resolver services:
     ```bash
     cd resolver/service/
     RESOLVER_INDEX=0 npm run start:enhanced-resolver
     RESOLVER_INDEX=1 npm run start:enhanced-resolver
     RESOLVER_INDEX=2 npm run start:enhanced-resolver
     RESOLVER_INDEX=3 npm run start:enhanced-resolver
     ```

3. Make sure your user wallet is configured in `resolver/.env`:
   - `USER_PRIVATE_KEY`
   - `USER_WALLET_ADDRESS`

## Usage

### 1. Fund User Wallet

First, fund your user wallet with test tokens on the source chain:

```bash
# Fund with default amounts (1000 USDT, 1000 DAI, 10 Wrapped Native)
npm run fund-user -- --chain eth_sepolia

# Fund with custom amounts
npm run fund-user -- --chain eth_sepolia --usdt 5000 --dai 5000 --wrapped 50

# Fund a specific wallet
npm run fund-user -- --chain eth_sepolia --wallet 0x... --usdt 1000
```

### 2. Check Balances

Check your balances across all chains:

```bash
# Check default user wallet
npm run check-balances

# Check specific wallet
npm run check-balances -- 0x...
```

### 3. Execute Cross-Chain Swap

Run a complete cross-chain swap:

```bash
# Swap 100 USDT from Ethereum Sepolia to Base Sepolia
npm run test-swap -- --from eth_sepolia --to base_sepolia --token USDT --amount 100

# Swap 50 DAI from Base Sepolia to Arbitrum Sepolia
npm run test-swap -- --from base_sepolia --to arb_sepolia --token DAI --amount 50

# Swap 1 WETH from Arbitrum Sepolia to Monad Testnet
npm run test-swap -- --from arb_sepolia --to monad_testnet --token WETH --amount 1

# Use custom secret (optional)
npm run test-swap -- --from eth_sepolia --to base_sepolia --token USDT --amount 100 --secret myCustomSecret123
```

## Supported Chains

- `eth_sepolia` - Ethereum Sepolia
- `base_sepolia` - Base Sepolia
- `arb_sepolia` - Arbitrum Sepolia
- `monad_testnet` - Monad Testnet

## Supported Tokens

- `USDT` - Mock USDT (6 decimals)
- `DAI` - Mock DAI (18 decimals)
- `WETH` - Wrapped Native Token (18 decimals)

## Cross-Chain Swap Flow

The `test-swap` script automates the entire 10-step HTLC process:

1. **User approves** UniteEscrowFactory to spend tokens
2. **User signs order** with EIP-712 signature
3. **Submits to relayer** with secret
4. **Relayer broadcasts** to resolvers via AWS SQS
5. **Resolver commits** to fulfill order
6. **Deploys escrows** on both chains
7. **Relayer transfers** user funds to source escrow
8. **Resolver deposits** tokens on destination chain
9. **Secret revealed**, funds released to user
10. **Resolver withdraws** from source chain

The script monitors the entire process and shows real-time status updates.

## Troubleshooting

1. **"USER_PRIVATE_KEY not found"**: Add your user wallet private key to `resolver/.env`

2. **"Order execution timeout"**: Check that all services are running and contracts are deployed

3. **"Insufficient balance"**: Run `fund-user` to mint test tokens

4. **"Approval failed"**: Ensure you have native gas tokens on the source chain

## Example Test Scenario

```bash
# 1. Fund user on Ethereum Sepolia
npm run fund-user -- --chain eth_sepolia --usdt 1000

# 2. Check initial balances
npm run check-balances

# 3. Execute swap: 100 USDT from Ethereum Sepolia to Base Sepolia
npm run test-swap -- --from eth_sepolia --to base_sepolia --token USDT --amount 100

# 4. Check final balances (should see ~95-100 USDT on Base Sepolia)
npm run check-balances
```

## Notes

- The minimum acceptable price is set to 95% of the input amount
- Order duration is 5 minutes
- The script automatically generates a random secret if not provided
- Make sure you have native gas tokens on both source and destination chains