# Live Blockchain Deployment Plan

## Deployment Wallet
**Address**: `0x90A4126eaf37b848561337cE8C6d4c1Ab7d796D4`
**Private Key**: `0xdd3c2387deb87a5ef0109c3ae8a435bf49972bc82f4d8d8a911be1c82f23e380`

## Target Networks
1. **Etherlink Testnet**
   - Chain ID: 128123
   - RPC: https://node.ghostnet.etherlink.com
   - Explorer: https://testnet.explorer.etherlink.com

2. **Base Sepolia**
   - Chain ID: 84532
   - RPC: https://sepolia.base.org
   - Explorer: https://sepolia.basescan.org

## Deployment Sequence

### Phase 1: Contract Deployment
Execute on both chains:

```bash
# Deploy on Etherlink
forge script script/DeployRelayerService.s.sol --rpc-url https://node.ghostnet.etherlink.com --broadcast --env-file .env.deployment

# Deploy on Base Sepolia
forge script script/DeployRelayerService.s.sol --rpc-url https://sepolia.base.org --broadcast --env-file .env.deployment
```

**Contracts to Deploy:**
1. EnhancedEscrowFactory
2. RelayerService
3. UniteResolverV2
4. MockToken (SRC)
5. MockToken (DST)

### Phase 2: Live Testing
Execute crosschain swap tests:

```bash
# Test on Etherlink (source)
forge script script/TestCrosschainSwap.s.sol --rpc-url https://node.ghostnet.etherlink.com --broadcast --env-file .env.deployment

# Test on Base Sepolia (source)
forge script script/TestCrosschainSwap.s.sol --rpc-url https://sepolia.base.org --broadcast --env-file .env.deployment
```

## Expected Transaction Flow

### Etherlink → Base Sepolia Swap

1. **Etherlink Transactions:**
   - Token approval
   - Pre-approval registration
   - Order creation
   - Resolver commitment
   - Escrow creation (with 0.002 ETH safety deposits)
   - Resolver withdrawal (after secret reveal)

2. **Base Sepolia Transactions:**
   - Secret reveal
   - User fund claim

### Base Sepolia → Etherlink Swap
Reverse of the above flow.

## Gas Estimates
- **Deployment per chain**: ~0.02 ETH
- **Test transactions per chain**: ~0.01 ETH
- **Safety deposits**: 0.002 ETH per swap
- **Total needed per chain**: ~0.035 ETH

## Success Metrics
1. ✅ All contracts deploy successfully
2. ✅ Cross-chain order creation works
3. ✅ Resolver commitment mechanism functions
4. ✅ Escrow creation with safety deposits
5. ✅ Secret reveal and fund unlocking
6. ✅ Rescue mechanism (if time permits)

## Real Transaction Data Collection
Will capture:
- Transaction hashes
- Gas used
- Block numbers
- Timestamps
- Contract addresses
- Order IDs
- Secrets and hashlocks
- Final balances