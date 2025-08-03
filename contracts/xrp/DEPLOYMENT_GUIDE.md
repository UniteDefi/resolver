# XRPL Unite Protocol Deployment Guide

## 🚀 Complete Setup & Deployment Instructions

### Step 1: Environment Setup ✅
```bash
# Install dependencies
npm install

# Generate wallets and create .env file
npm run setup-env
```

### Step 2: Fund Deployer Wallet 💰
**DEPLOYER ADDRESS TO FUND:** `rfWBReUHdZmxrsXhPRmM2DVf77p6jeVAfF`

1. Go to [XRPL Testnet Faucet](https://xrpl.org/xrp-testnet-faucet.html)
2. Enter deployer address: `rfWBReUHdZmxrsXhPRmM2DVf77p6jeVAfF`
3. Request funding (1,000 XRP per request)
4. **Repeat 10+ times** to get sufficient funding (10,000+ XRP recommended)

### Step 3: Verify Funding 📊
```bash
# Check all wallet balances
npm run check-balances
```
Wait until deployer shows "🚀 WELL FUNDED" status.

### Step 4: Deploy Contracts 📄
```bash
# Deploy all XRPL contracts
npm run deploy
```
This will:
- Initialize XRPLHTLCFactory
- Initialize XRPLOrderProtocol  
- Create resolver instances
- Update deployments.json

### Step 5: Fund All Wallets 💸
```bash
# Fund all wallets from deployer
FUND_TARGETS="all" FUND_AMOUNT="1000" npm run fund-wallets
```

### Step 6: Verify Complete Setup ✅
```bash
# Check all balances again
npm run check-balances

# Should show all wallets funded
```

### Step 7: Ready for Testing 🧪
```bash
# Run comprehensive test suite (wait for Base Sepolia deployment info)
npm test
```

## Generated Wallets 🔐

### XRPL Wallets
- **Deployer**: `rfWBReUHdZmxrsXhPRmM2DVf77p6jeVAfF`
- **User**: `rKd492FUL6J9X2cQA24tecnF38ewc9XmKZ`
- **Resolver0**: `rBBgppLwei21kZRcpBdFhiqbHPKBdiKdsc`
- **Resolver1**: `rGFFBH3M6HTKoRyx6knDbpcCq3DTNKYSJB`
- **Resolver2**: `rLE9TktDPwYVW89gtUGEu5QGf4TmaeXfpQ`
- **Resolver3**: `rMcdGqR6GH1NrpwRjLQXrYyipDjBuLBYSC`

### EVM Wallets (Base Sepolia)
- **Deployer**: `0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35`
- **Test User**: `0x6B9ad963c764a06A7ef8ff96D38D0cB86575eC00`
- **Resolver0**: `0x875eF470dffF58acd5903c704DB65D50022eA994`
- **Resolver1**: `0x24a330C62b739f1511Ec3D41cbfDA5fCc4DD6Ae6`
- **Resolver2**: `0x6e90aB122b10fEad2cAc61c3d362B658d56a273f`
- **Resolver3**: `0x62181aDd17d4b6C7303b26CE6f9A3668835c0E51`

## Deployment Status 📋

- [x] Environment setup (.env files created)
- [x] Wallet generation complete
- [x] Deployment scripts ready
- [ ] **WAITING**: Deployer funding (10,000+ XRP needed)
- [ ] Contract deployment
- [ ] Wallet funding distribution
- [ ] Cross-chain testing

## Commands Quick Reference 📝

```bash
# Environment & Setup
npm run setup-env          # Generate wallets & .env
npm run check-balances     # Check wallet balances

# Deployment
npm run deploy             # Deploy all contracts
npm run fund-wallets       # Fund wallets from deployer

# Testing  
npm test                   # Run comprehensive tests

# Utilities
npm run distribute-xrp     # Distribute specific amounts
npm run build             # Build TypeScript
```

## Next Steps 🎯

1. **Fund the deployer wallet** (most important!)
2. Run deployment pipeline
3. Await Base Sepolia deployment information
4. Execute cross-chain tests

**Current Status**: ⏳ Waiting for deployer funding