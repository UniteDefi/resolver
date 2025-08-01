# NEAR Testnet Wallet Setup

This guide explains how to generate and manage NEAR testnet wallets for the Unite DeFi project.

## Quick Start

1. **Generate a new testnet wallet:**
   ```bash
   npm run generate-wallet
   ```

2. **Verify wallet setup:**
   ```bash
   npm run verify-wallet
   ```

3. **Fund your wallet** at https://wallet.testnet.near.org/

## Generated Files

### `.env` File
Contains environment variables for NEAR development:
```env
NEAR_NETWORK_ID=testnet
NEAR_NODE_URL=https://rpc.testnet.near.org
NEAR_MASTER_ACCOUNT=unite-defi-test-[timestamp].testnet
NEAR_CONTRACT_NAME=counter.unite-defi-test-[timestamp].testnet
NEAR_ACCOUNT_ID=unite-defi-test-[timestamp].testnet
```

### Credentials File
Private key stored in NEAR format at:
```
~/.near-credentials/testnet/[account-id].json
```

## Account Naming Convention

Generated accounts follow this pattern:
- `unite-defi-test-[timestamp].testnet`
- Example: `unite-defi-test-1754059525.testnet`

## Funding Your Wallet

### Method 1: NEAR Wallet (Recommended)
1. Visit https://wallet.testnet.near.org/
2. Click "Import Existing Account"
3. Enter your account ID and private key
4. Complete the funding process

### Method 2: Direct Transfer
Send NEAR tokens to your account ID from another funded testnet account.

### Method 3: Testnet Faucet
Some testnet faucets may be available for free NEAR tokens.

## Security Notes

- **Private keys are stored locally** in `~/.near-credentials/`
- **Never share your private key** with anyone
- **This is for testnet only** - not suitable for mainnet
- **Keep backups** of your credentials in a secure location

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run generate-wallet` | Generate new testnet wallet |
| `npm run verify-wallet` | Verify wallet configuration |
| `npm run deploy` | Deploy contracts using wallet |
| `npm run interact` | Interact with deployed contracts |

## Troubleshooting

### Account Not Found Error
This is normal for newly generated accounts. The account exists in your keystore but needs to be funded to exist on the blockchain.

### Key Not Found Error
Run `npm run generate-wallet` to create a new wallet and credentials.

### Network Connection Issues
Verify your internet connection and that testnet RPC is accessible:
```bash
curl https://rpc.testnet.near.org/status
```

## Development Workflow

1. Generate wallet: `npm run generate-wallet`
2. Fund wallet at https://wallet.testnet.near.org/
3. Verify setup: `npm run verify-wallet`
4. Deploy contracts: `npm run deploy`
5. Test interactions: `npm run interact`

## Explorer Links

- **Account Explorer:** https://explorer.testnet.near.org/accounts/[your-account-id]
- **Transaction History:** View all transactions for your account
- **Contract State:** Monitor deployed contract state