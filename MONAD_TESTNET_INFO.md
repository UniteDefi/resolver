# Monad Testnet Information

## Network Details

- **Network Name**: Monad Testnet
- **Chain ID**: 10143
- **Currency Symbol**: MON
- **Block Explorer**: TBD (Not yet available)

## RPC Endpoints

### Primary RPC
- **URL**: https://testnet-rpc.monad.xyz/
- **Rate Limits**: Unknown (use with caution)
- **WebSocket**: Not documented

### Alternative RPCs
- Currently only one official RPC endpoint is available

## Faucets

### Official Faucet
- **Status**: Not publicly available yet
- **Alternative**: Request testnet MON in Monad Discord

### Getting Testnet MON
1. Join Monad Discord: https://discord.gg/monad
2. Complete verification
3. Request testnet tokens in #testnet-faucet channel
4. Provide your wallet address

## Base Sepolia Information

### Network Details
- **Network Name**: Base Sepolia
- **Chain ID**: 84532
- **Currency Symbol**: ETH
- **Block Explorer**: https://sepolia.basescan.org/

### RPC Endpoints
- **Primary**: https://sepolia.base.org
- **Alternative**: https://base-sepolia.public.blastapi.io

### Faucets
- **Alchemy Faucet**: https://sepoliafaucet.com/
- **QuickNode Faucet**: https://faucet.quicknode.com/base/sepolia
- **Ethereum Sepolia Bridge**: Bridge ETH from Sepolia to Base Sepolia

## Test Deployment Instructions

1. Set up environment variables:
   ```bash
   export PRIVATE_KEY="your-private-key"
   export MONAD_RPC_URL="https://testnet-rpc.monad.xyz/"
   export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
   ```

2. Deploy contracts:
   ```bash
   forge script script/DeployMonadBase.s.sol --broadcast --verify
   ```

3. Run tests:
   ```bash
   # Run all tests
   forge test --match-path test/crosschain/MonadBaseHTLC.t.sol -vvv

   # Run specific test
   forge test --match-test test_FullHTLCFlow -vvv
   ```

## Known Issues

1. **Monad Testnet**:
   - Limited documentation available
   - No public block explorer yet
   - Faucet access requires Discord verification
   - RPC may have undocumented rate limits

2. **Cross-chain Testing**:
   - Ensure sufficient balance on both chains
   - Account for network latency in timeout settings
   - Gas prices may vary significantly between chains

## Troubleshooting

### RPC Connection Issues
- Verify RPC URL is correct
- Check network status in Discord
- Try alternative RPC endpoints if available

### Faucet Issues
- Ensure Discord verification is complete
- Wait for cooldown period between requests
- Ask for help in #testnet-support channel

### Transaction Failures
- Check gas balance on both chains
- Verify contract addresses
- Ensure proper timeout configurations

## Support

- **Monad Discord**: https://discord.gg/monad
- **Base Support**: https://base.org/discord
- **UniteDefi Issues**: Create issue in project repository