# Aptos Scripts Usage

This directory contains scripts for deploying and managing the Unite Protocol on Aptos, similar to the EVM scripts structure.

## Quick Start Scripts

### 1. Deploy All Contracts
```bash
# Deploy all contracts and initialize them
npx tsx scripts/deploy_all.ts
```

### 2. Fund All Wallets
```bash
# Fund all wallets with APT and mint tokens
npx tsx scripts/fund_all_wallets.ts
```

### 3. Mint Tokens to All Wallets
```bash
# Mint test USDT and DAI to all configured wallets
npx tsx scripts/mint_tokens_all.ts
```

## Environment Setup

Create a `.env` file with the following variables:

```env
# Network
APTOS_NETWORK=testnet

# Deployer/Admin account
APTOS_PRIVATE_KEY=0x...

# User account
APTOS_USER_PRIVATE_KEY=0x...

# Resolver accounts
APTOS_RESOLVER_PRIVATE_KEY_0=0x...
APTOS_RESOLVER_PRIVATE_KEY_1=0x...
APTOS_RESOLVER_PRIVATE_KEY_2=0x...
APTOS_RESOLVER_PRIVATE_KEY_3=0x...

# Funding configuration (optional)
FUND_AMOUNT=0.5  # APT per wallet
SKIP_TOKENS=false  # Set to true to skip token minting
```

## Individual Scripts

### Deployment
- `deploy.ts` - Main deployment script with auto-funding
- `deploy_all.ts` - Simple wrapper for complete deployment

### Wallet Management
- `fund_wallets.ts` - Advanced wallet funding with configuration
- `fund_all_wallets.ts` - Simple wrapper to fund all wallets
- `mint_tokens_all.ts` - Mint test tokens to all wallets

### Utilities
- `get_address.ts` - Get account addresses
- `verify-deployment.ts` - Verify deployment status

## Usage Examples

### Complete Setup (New Environment)
```bash
# 1. Deploy contracts
npx tsx scripts/deploy_all.ts

# 2. Fund wallets and mint tokens
npx tsx scripts/fund_all_wallets.ts
```

### Custom Funding
```bash
# Fund with custom APT amount
FUND_AMOUNT=1.0 npx tsx scripts/fund_all_wallets.ts

# Fund without minting tokens
SKIP_TOKENS=true npx tsx scripts/fund_all_wallets.ts
```

### Token Minting Only
```bash
# Mint tokens to all wallets (requires deployment first)
npx tsx scripts/mint_tokens_all.ts
```

## Testing

Run the comprehensive cross-chain test:

```bash
npm test
```

This will run `tests/aptos-evm-crosschain.test.ts` which tests the complete cross-chain swap flow between Aptos and Base Sepolia.

## Script Structure

The scripts follow the same pattern as the EVM scripts:
- `DeployAll.s.sol` → `deploy_all.ts`
- `MintTokens.s.sol` → `mint_tokens_all.ts`  
- `FundWallets.s.sol` → `fund_all_wallets.ts`

This ensures consistency across EVM and Aptos implementations.