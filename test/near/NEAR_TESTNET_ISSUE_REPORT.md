# NEAR Testnet WASM Execution Issue Report

**Date**: January 27, 2025  
**Reporter**: Developer working on cross-chain HTLC integration  
**Issue**: Systematic `CompilationError(PrepareError(Deserialization))` on all contract executions

## Executive Summary

We've encountered a critical issue where ALL smart contracts on NEAR testnet fail with `CompilationError(PrepareError(Deserialization))` during function execution, despite successful deployments. This affects even official NEAR SDK examples.

## Issue Details

### Error Message
```json
{
  "index": 0,
  "kind": {
    "index": 0,
    "kind": {
      "FunctionCallError": {
        "CompilationError": {
          "PrepareError": "Deserialization"
        }
      }
    }
  }
}
```

### Affected Operations
- ❌ Contract function calls (both change and view methods)
- ❌ Contract initialization
- ✅ Contract deployment (succeeds)
- ✅ Account creation (succeeds)

## Reproduction Steps

1. Deploy ANY contract to testnet (deployment succeeds)
2. Call ANY function on the contract
3. Receive `CompilationError(PrepareError(Deserialization))`

## Our Testing Environment

- **NEAR CLI Version**: 4.0.13
- **Rust Version**: 1.88.0 (also tested 1.69.0)
- **NEAR SDK Versions Tested**: 
  - 5.15.1 (latest)
  - 5.5.0
  - 5.0.0
  - 4.0.0
- **Platform**: macOS (aarch64-apple-darwin)
- **Node.js**: v22.17.0

## Comprehensive Debugging Attempts

### 1. Contract Variations Tested
- ✅ Our custom HTLC contracts
- ✅ Minimal "Hello World" contracts
- ✅ Empty contracts with just a ping function
- ✅ **Official NEAR SDK examples** (status-message from near-sdk-rs repo)

### 2. SDK and Compilation Approaches
- Tested multiple NEAR SDK versions (4.0.0 to 5.15.1)
- Applied recommended compiler flags: `-C target-cpu=mvp`
- Used wasm-opt optimizations: `wasm-opt -Oz --signext-lowering --enable-bulk-memory-opt`
- Tried different Rust toolchain versions (1.69.0, 1.88.0)
- Used official NEAR SDK build configuration

### 3. Deployment Strategies
- Created fresh accounts for testing
- Deployed to multiple subaccounts
- Used both old and new NEAR CLI syntax
- Attempted with and without initialization

### 4. Direct RPC Testing
```bash
curl -X POST https://rpc.testnet.near.org \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "dontcare",
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "debug-test.unite-defi-test-1753622960.testnet",
      "method_name": "get_status",
      "args_base64": "eyJhY2NvdW50X2lkIjoidGVzdCJ9"
    }
  }'
```

**Result**: Same deserialization error via direct RPC

## Evidence and Transaction Hashes

### Successful Deployments (but execution fails):
- Account: `unite-defi-test-1753622960.testnet`
- Relayer: `relayer.unite-defi-test-1753622960.testnet`
  - Deploy TX: `Ek8Y6Swog5GGPnznCWvXdyqWusJpNK7ehDTzeHMTA7x7`
- Debug Account: `debug-test.unite-defi-test-1753622960.testnet`
  - Deploy TX: `CNWpZy8mbmE6LaGarfPwYYfqrmFNtoUASmFTnnSqSdQD`

### Failed Execution Attempts:
- `HZG4VjbwridJFa281fKEfi26SRYnL8CSrd6W8rDkyUcq`
- `U21Xd32jtLLXmLPXPgnMTDWzUEK1pvERKMCUHcKDxLJ`
- `9a8sGDE3TiunJpn63zUqVtZSpDVTrDUeYNMDRfosRP1R`

## Key Findings

1. **Issue is systemic**: Affects ALL contracts, including official NEAR examples
2. **Deployment succeeds**: Contracts deploy with valid code_hash
3. **Execution fails**: Both view and change methods fail with same error
4. **Not a local issue**: Direct RPC calls confirm the error happens server-side
5. **Account state is valid**: Accounts show proper storage and code_hash

## Contract Source for Reproduction

### Minimal Example That Fails:
```rust
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{near_bindgen, PanicOnDefault};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct EmptyContract {}

#[near_bindgen]
impl EmptyContract {
    #[init]
    pub fn new() -> Self {
        Self {}
    }

    pub fn ping(&self) -> String {
        "pong".to_string()
    }
}
```

### Official Example That Also Fails:
The `status-message` example from https://github.com/near/near-sdk-rs/tree/master/examples/status-message

## Impact

This issue completely blocks smart contract development and testing on NEAR testnet. While deployments succeed, no contract functionality can be executed, making the testnet unusable for its intended purpose.

## Questions for NEAR Team

1. Are you aware of any recent changes to the testnet WASM runtime?
2. Is this a known issue with a planned fix?
3. Are there specific WASM features or opcodes that testnet currently doesn't support?
4. Is there a recommended workaround or alternative testnet endpoint?

## How to Help

We're happy to:
- Provide additional debugging information
- Test proposed fixes
- Share our compiled WASM files for analysis
- Run any diagnostic commands you suggest

Please let us know if you need any additional information to diagnose this issue.

---

**Contact**: [Your contact information]  
**Project**: Cross-chain HTLC integration between NEAR and Base