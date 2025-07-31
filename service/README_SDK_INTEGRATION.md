# Cross-Chain Swap SDK Integration

## Problem Summary

The original implementation was failing because it was trying to use the 1inch Limit Order Protocol for cross-chain swaps without the proper order structure. The LimitOrderProtocol was attempting to transfer destination tokens from the resolver to the maker on the source chain, which is impossible in cross-chain swaps.

## Solution

The solution is to use the `@1inch/cross-chain-sdk` to create properly formatted cross-chain orders that include:

1. **PostInteraction Extension**: The order must include an extension that points to the EscrowFactory as a postInteraction target
2. **Cross-Chain Parameters**: All cross-chain specific data (timelocks, safety deposits, chain IDs) are encoded in the order extension
3. **Proper Order Flow**: The LimitOrderProtocol transfers source tokens, then calls the EscrowFactory's postInteraction to create the escrow

## How It Works

```
1. User creates order with SDK → Order includes EscrowFactory as postInteraction
2. User signs order → Standard EIP-712 signature
3. Resolver calls fillOrderArgs → LOP transfers tokens AND calls postInteraction
4. PostInteraction creates escrow → Source escrow is deployed with cross-chain data
5. Resolver deploys dst escrow → Using data from SrcEscrowCreated event
```

## Key Files

- `sdk_enhanced_resolver.ts` - Updated resolver that uses the SDK
- `examples/create_cross_chain_order.ts` - Example of creating a proper order
- `test/cross-chain-swap.test.ts` - Test suite for the full flow

## Running the SDK Resolver

```bash
# Install dependencies
yarn install

# Run the SDK-based resolver
yarn start:sdk-resolver

# Run tests
yarn test:sdk
```

## Important Changes

1. **Order Creation**: Must use `Sdk.CrossChainOrder.new()` with the EscrowFactory address
2. **Extension Data**: The SDK automatically creates the proper extension with postInteraction
3. **No Contract Changes**: The existing Resolver and EscrowFactory contracts work as-is
4. **Token Pre-funding**: Resolver contracts must be pre-funded with destination tokens

## Example Order Creation

```typescript
const order = Sdk.CrossChainOrder.new(
  new Address(escrowFactory), // CRITICAL: Factory address here
  {
    // Standard order parameters
    maker: userAddress,
    makerAsset: srcToken,
    takerAsset: dstToken, // On different chain!
    makingAmount: srcAmount,
    takingAmount: dstAmount,
  },
  {
    // Cross-chain parameters
    hashLock: Sdk.HashLock.forSingleFill(secret),
    timeLocks: Sdk.TimeLocks.new({...}),
    srcChainId,
    dstChainId,
    srcSafetyDeposit,
    dstSafetyDeposit,
  },
  // ... auction and traits
);
```

## Debugging Tips

1. Check that the order extension is not empty
2. Verify the EscrowFactory address is correct in the order
3. Ensure resolver contracts have destination tokens
4. Monitor the SrcEscrowCreated events
5. Use forge test traces to debug contract interactions