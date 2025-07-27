# BLOCKERS: Tron Integration

## Overview
This document outlines the blockers and compatibility issues encountered during the Tron <> Base Sepolia HTLC integration.

## Status: ⚠️ PARTIAL BLOCKER

## TVM Compatibility Issues

### 1. Contract Bytecode Compilation
**Issue**: Contracts need to be compiled specifically for TVM
**Status**: 🟡 Workaround Available
**Details**:
- TVM is mostly EVM-compatible but requires contracts compiled with TronBox or Tron-IDE
- Standard Foundry/Hardhat compiled bytecode may not work directly
**Solution**: 
- Use TronBox for contract compilation
- Or use Tron-IDE online compiler
- Maintain separate build process for Tron contracts

### 2. Energy and Bandwidth Model
**Issue**: Tron uses Energy/Bandwidth instead of gas
**Status**: 🟢 Handled
**Details**:
- Transactions require Energy (similar to gas) and Bandwidth
- Users need to freeze TRX to get Energy/Bandwidth or pay in TRX
- Fee limits need to be set differently than EVM chains
**Solution**: 
- Implemented resource checking in deployment scripts
- Added feeLimit and originEnergyLimit parameters
- Monitor resource usage in tests

### 3. Address Format Differences
**Issue**: Tron uses base58 addresses vs hex addresses
**Status**: 🟢 Handled
**Details**:
- Tron addresses start with 'T' (e.g., TKLJhHvb...)
- Need conversion between hex and base58 formats
**Solution**: 
- Use TronWeb's address conversion utilities
- `tronWeb.address.fromHex()` and `tronWeb.address.toHex()`

### 4. TRX/SUN Unit Conversion
**Issue**: Different unit system than ETH/Wei
**Status**: 🟢 Handled
**Details**:
- 1 TRX = 1,000,000 SUN (vs 1 ETH = 10^18 Wei)
- Need careful unit conversions in contracts and tests
**Solution**: 
- Use `tronWeb.toSun()` and `tronWeb.fromSun()` for conversions
- Added unit conversion tests

### 5. Contract Deployment Process
**Issue**: Different deployment API and parameters
**Status**: 🟡 Workaround Required
**Details**:
- TronWeb uses different deployment parameters
- Need to specify feeLimit, callValue, userFeePercentage, originEnergyLimit
- Contract factory pattern differs from ethers.js
**Solution**: 
- Created custom deployment scripts for Tron
- Handle Tron-specific deployment parameters

### 6. Event Monitoring
**Issue**: Different event structure and monitoring approach
**Status**: 🟡 Needs Testing
**Details**:
- Tron events have different structure than EVM events
- Event parsing requires different approach
- WebSocket support may vary
**Solution**: 
- Implement custom event parsing for Tron
- Use polling as fallback if WebSocket unavailable

## Required Actions

### Immediate (Blocking)
1. **Contract Compilation**: Need to compile contracts with TronBox or get proper bytecode
   ```bash
   # Install TronBox globally
   npm install -g tronbox
   
   # Or use Tron-IDE: https://tron-ide.com
   ```

2. **Test Account Funding**: 
   - Get test TRX from Shasta faucet: https://www.trongrid.io/shasta
   - Need at least 1000 TRX for testing

### Before Production
1. **Resource Optimization**: 
   - Analyze Energy/Bandwidth consumption
   - Implement resource management strategy
   - Consider multi-signature for resource delegation

2. **Cross-chain Event Monitoring**:
   - Implement robust event monitoring for secret revelation
   - Handle Tron's different event structure
   - Add retry logic for failed transactions

3. **Security Audit**:
   - Verify TVM-specific security considerations
   - Test edge cases around resource limits
   - Validate cross-chain atomic swap guarantees

## Recommendations

1. **Development Workflow**:
   - Maintain separate compilation pipeline for Tron
   - Use TronBox for Tron-specific contracts
   - Keep shared logic in libraries

2. **Testing Strategy**:
   - Test on Shasta first (more stable than Nile)
   - Monitor resource consumption closely
   - Implement comprehensive error handling

3. **Production Considerations**:
   - Set up resource delegation for users
   - Implement fee estimation for Tron
   - Consider TRC20 vs TRC721 token standards

## Test Results

### Completed Tests
- ✅ TronWeb integration setup
- ✅ Address format conversion
- ✅ Unit conversion (TRX/SUN)
- ✅ Basic contract deployment structure

### Pending Tests
- ⏳ Actual contract deployment on Shasta
- ⏳ HTLC flow execution
- ⏳ Cross-chain secret revelation
- ⏳ Timeout scenarios
- ⏳ Resource consumption analysis

## Next Steps

1. Compile contracts with TronBox
2. Fund test accounts on Shasta
3. Execute full HTLC test flow
4. Document actual resource consumption
5. Optimize for production use

## Resources

- [Tron Developer Hub](https://developers.tron.network/)
- [TronWeb Documentation](https://tronweb.network/docu/docs/intro/)
- [Shasta Testnet Faucet](https://www.trongrid.io/shasta)
- [TVM vs EVM Differences](https://developers.tron.network/docs/tvm-vs-evm)
- [Tron Energy & Bandwidth](https://developers.tron.network/docs/resource-model)