# Migration Guide: UniteDefi V1 to V2 Architecture

## Overview

This guide helps migrate from the old UniteDefi architecture to the new V2 architecture. The key change is separating auction creation from escrow deployment, enabling gasless operations for users after initial approval.

## Key Architecture Changes

### V1 (Old) Flow:
1. User creates auction AND escrow simultaneously
2. Resolver settles auction 
3. Cross-chain HTLC execution

### V2 (New) Flow:
1. **User pre-approves tokens** to EscrowFactory (one-time)
2. **Relayer posts auction** WITHOUT creating escrow
3. **Resolver wins auction** by settling it
4. **Resolver creates escrows** with safety deposits on BOTH chains
5. **Relayer moves user funds** after verifying resolver commitment
6. **Secret reveal** happens after confirmations

## Contract Changes

### SimpleDutchAuction.sol
- ✅ No changes needed - already supports auction without escrow

### UniteResolver.sol → UniteResolverV2.sol
Major changes:
```solidity
// Old: Auction creates escrow immediately
function createAuctionWithEscrow(...) 

// New: Separate functions
function winAuction(bytes32 auctionId) // Resolver wins by settling
function createEscrowsAsResolver(...) // Only winner can create escrows
```

### EscrowFactory → EnhancedEscrowFactory
New features:
```solidity
// User pre-approval tracking
mapping(address => mapping(address => bool)) public userTokenApprovals;

// Authorized relayers
mapping(address => bool) public authorizedRelayers;

// New functions
function preApproveToken(address token, uint256 amount)
function moveUserFundsToEscrow(...)
```

### Escrow Contracts
- Safety deposit requirement: 0.001 ETH
- Exclusive resolver lock mechanism
- Enhanced event emissions

## Migration Steps

### 1. Deploy New Contracts

```bash
# Deploy in this order:
1. EnhancedEscrowFactory
2. UniteResolverV2
3. Configure relayer authorization
```

### 2. Update User Interface

Users need to:
1. Pre-approve tokens to EnhancedEscrowFactory (one-time)
2. Create auctions through relayer service

### 3. Update Resolver Services

Resolvers need to:
1. Monitor auctions WITHOUT escrows
2. Win auctions by calling `winAuction()`
3. Create escrows with safety deposits
4. Wait for relayer to move user funds

### 4. Update Relayer Service

Relayer needs to:
1. Post auctions without creating escrows
2. Monitor for resolver escrow creation
3. Move user funds after verification
4. Track confirmations before allowing reveals

## Code Examples

### User Pre-Approval (One-Time)
```solidity
// User approves factory
token.approve(enhancedEscrowFactory, MAX_UINT256);
enhancedEscrowFactory.preApproveToken(token, MAX_UINT256);
```

### Relayer Posts Auction
```solidity
// No escrow creation!
auction.createAuction(
    auctionId,
    token,
    amount,
    startPrice,
    endPrice,
    duration
);
```

### Resolver Wins and Creates Escrows
```solidity
// Step 1: Win auction
resolver.winAuction{value: currentPrice}(auctionId);

// Step 2: Create escrows with safety deposits
resolver.createEscrowsAsResolver{value: SAFETY_DEPOSIT}(
    auctionId,
    srcImmutables,
    dstImmutables,
    order,
    r,
    vs,
    amount,
    takerTraits,
    args,
    srcCancellationTimestamp
);
```

### Relayer Moves Funds
```solidity
// After verifying escrows on both chains
escrowFactory.moveUserFundsToEscrow(
    user,
    token,
    amount,
    escrowAddress
);
```

## Safety Considerations

1. **Safety Deposits**: All escrows require 0.001 ETH deposit
2. **Exclusive Rights**: Only auction winner can create escrows
3. **Relayer Authorization**: Only authorized relayers can move funds
4. **Confirmation Delays**: Enforce waiting periods before reveals

## Testing

Run the new V2 tests:
```bash
forge test --match-contract EtherlinkBaseHTLCV2 -vvv
```

Key test scenarios:
- Complete V2 flow
- Resolver exclusivity
- Safety deposit mechanics
- Relayer authorization

## Deployment Checklist

- [ ] Deploy EnhancedEscrowFactory
- [ ] Deploy UniteResolverV2
- [ ] Authorize relayers
- [ ] Update frontend for pre-approvals
- [ ] Update resolver services
- [ ] Update relayer services
- [ ] Test on testnet
- [ ] Monitor gas usage improvements
- [ ] Document API changes

## Benefits of V2

1. **Gasless Operations**: Users approve once, then gasless
2. **Better Competition**: Resolvers compete fairly
3. **Safety Deposits**: Incentivizes completion
4. **Exclusive Rights**: Prevents griefing
5. **Clear Separation**: Auction vs escrow logic

## Rollback Plan

If issues arise:
1. Pause new auctions
2. Complete in-flight auctions
3. Revert relayer to V1 logic
4. Fix issues and retry

## Support

For questions about migration:
- Review test files for examples
- Check contract documentation
- Test thoroughly on testnet first