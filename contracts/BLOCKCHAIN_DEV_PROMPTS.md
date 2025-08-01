# Blockchain Development Environment Setup Prompts

## Overview
This document contains prompts for setting up development environments, smart contracts, and tests for 14 different blockchain platforms. Each chain has two phases:
- **Phase 1**: Environment setup, basic contract development, TypeScript tests, and deployment scripts (using native tooling)
- **Phase 2**: Testnet deployment and verification with funded wallets

---

## 1. Aptos (Move)

### Phase 1 - Environment Setup & Development
```
Set up an Aptos Move development environment in contracts/aptos/. 
- Initialize an Aptos project with Move.toml
- Create a basic counter contract in Move that has increment/decrement/get_value functions
- Set up TypeScript testing environment with @aptos-labs/ts-sdk
- Create TypeScript tests in contracts/aptos/tests/ that deploy and interact with the counter contract
- Create deployment scripts using Aptos CLI (aptos move publish)
- List all required environment variables needed for deployment (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded an Aptos testnet wallet with the following:
- Private key: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]

Deploy the counter contract to Aptos testnet:
- Use aptos CLI to publish the Move module
- Deploy the contract and verify it's working
- Run the TypeScript tests against the deployed testnet contract
- Show me the transaction hashes and contract addresses
```

---

## 2. Bitcoin (UTXO, Script)

### Phase 1 - Environment Setup & Development
```
Set up a Bitcoin Script development environment in contracts/bitcoin/.
- Initialize a project for Bitcoin Script development using bitcoinjs-lib
- Create a basic time-locked transaction script (HTLC - Hash Time Locked Contract)
- Set up TypeScript testing environment with bitcoinjs-lib and regtest
- Create TypeScript tests in contracts/bitcoin/tests/ that create and spend the time-locked transaction
- Create example scripts for creating and spending transactions (can be in TypeScript)
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have a funded Bitcoin testnet wallet with:
- Private key: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED]

Create and broadcast a time-locked transaction on Bitcoin testnet:
- Update scripts to use testnet network
- Create and broadcast the HTLC transaction
- After timelock expires, spend the transaction
- Show me the transaction IDs and block explorer links
```

---

## 3. Osmosis (Cosmos SDK)

### Phase 1 - Environment Setup & Development
```
Set up an Osmosis/CosmWasm development environment in contracts/osmosis/.
- Initialize a CosmWasm project with cargo and workspace
- Create a basic counter contract in Rust that implements increment/decrement/query_count
- Set up TypeScript testing environment with @cosmjs/cosmwasm-stargate
- Create TypeScript tests in contracts/osmosis/tests/ that deploy and interact with the contract
- Create deployment scripts using osmosisd CLI or beaker
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded an Osmosis testnet wallet with:
- Mnemonic: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] OSMO

Deploy the counter contract to Osmosis testnet:
- Build and optimize the WASM contract
- Upload code to testnet using osmosisd
- Instantiate the contract
- Run TypeScript tests against deployed contract
- Show me contract address and transaction hashes
```

---

## 4. Sui (Move)

### Phase 1 - Environment Setup & Development
```
Set up a Sui Move development environment in contracts/sui/.
- Initialize a Sui project with Move.toml
- Create a basic counter object in Move with increment/decrement functions
- Set up TypeScript testing environment with @mysten/sui.js
- Create TypeScript tests in contracts/sui/tests/ that create and interact with counter objects
- Create deployment scripts using sui CLI (sui client publish)
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a Sui testnet wallet with:
- Private key: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] SUI

Deploy the counter module to Sui testnet:
- Build and publish the Move package using sui CLI
- Create a counter object instance
- Run TypeScript tests to increment/decrement
- Show me the package ID, object IDs, and transaction digests
```

---

## 5. Stellar

### Phase 1 - Environment Setup & Development
```
Set up a Stellar smart contract environment in contracts/stellar/.
- Initialize a Soroban (Stellar smart contracts) project with Rust
- Create a basic counter contract with increment/decrement/get_count functions
- Set up TypeScript testing environment with stellar-sdk and @stellar/stellar-sdk
- Create TypeScript tests in contracts/stellar/tests/ that deploy and interact with the contract
- Create deployment scripts using soroban CLI
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a Stellar testnet wallet with:
- Secret key: [WILL BE PROVIDED]
- Public key: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] XLM

Deploy the counter contract to Stellar testnet:
- Build and optimize the WASM contract
- Deploy to Soroban testnet using soroban CLI
- Initialize the contract
- Run TypeScript tests against deployed contract
- Show me contract ID and transaction hashes
```

---

## 6. TON (The Open Network)

### Phase 1 - Environment Setup & Development
```
Set up a TON smart contract environment in contracts/ton/.
- Initialize a TON project with Blueprint or ton-dev-cli
- Create a basic counter contract in FunC with increment/decrement/get_value methods
- Set up TypeScript testing environment with @ton/ton and @ton/sandbox
- Create TypeScript tests in contracts/ton/tests/ that deploy and interact with the contract
- Create deployment scripts using Blueprint or ton-dev-cli
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a TON testnet wallet with:
- Mnemonic: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] TON

Deploy the counter contract to TON testnet:
- Compile the FunC contract
- Deploy to testnet using Blueprint
- Run TypeScript tests to interact with the contract
- Show me contract address and transaction hashes
```

---

## 7. Cardano

### Phase 1 - Environment Setup & Development
```
Set up a Cardano smart contract environment in contracts/cardano/.
- Initialize a Plutus project using Aiken or PlutusTx
- Create a basic counter validator in Aiken that validates increment/decrement operations
- Set up TypeScript testing environment with @cardano-sdk/core and Lucid
- Create TypeScript tests in contracts/cardano/tests/ that interact with the validator
- Create deployment scripts using Aiken CLI or cardano-cli
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a Cardano preprod testnet wallet with:
- Mnemonic: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] tADA

Deploy and use the counter validator on Cardano preprod:
- Build the Aiken validator
- Deploy using cardano-cli or Aiken
- Create UTxOs at the script address
- Run TypeScript tests to increment/decrement
- Show me script address and transaction IDs
```

---

## 8. XRP Ledger

### Phase 1 - Environment Setup & Development
```
Set up an XRP Ledger development environment in contracts/xrp/.
- Since XRPL doesn't have traditional smart contracts, set up for Hooks (if available) or Payment Channels
- Create a basic escrow transaction setup using native XRPL features
- Set up TypeScript testing environment with xrpl.js
- Create TypeScript tests in contracts/xrp/tests/ that create and execute escrows
- Create scripts for escrow creation and fulfillment (can be in TypeScript or use rippled APIs)
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded an XRP testnet wallet with:
- Secret: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] XRP

Create and execute escrow transactions on XRP testnet:
- Connect to XRP testnet
- Create an escrow transaction
- Fulfill the escrow after conditions are met
- Show me transaction hashes and escrow details
```

---

## 9. Internet Computer (ICP)

### Phase 1 - Environment Setup & Development
```
Set up an Internet Computer development environment in contracts/icp/.
- Initialize a dfx project for ICP development
- Create a basic counter canister in Motoko or Rust with increment/decrement/getValue functions
- Set up TypeScript testing environment with @dfinity/agent
- Create TypeScript tests in contracts/icp/tests/ that deploy and interact with the canister
- Create deployment scripts using dfx deploy
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have an ICP identity with:
- Principal: [WILL BE PROVIDED]
- Cycles balance: [WILL BE PROVIDED]

Deploy the counter canister to ICP testnet:
- Build the canister
- Deploy to ICP testnet with dfx deploy --network ic
- Run TypeScript tests against deployed canister
- Show me canister ID and interaction results
```

---

## 10. Polkadot

### Phase 1 - Environment Setup & Development
```
Set up a Polkadot/Substrate smart contract environment in contracts/polkadot/.
- Initialize an ink! project for Substrate smart contracts
- Create a basic counter contract in Rust using ink! with increment/decrement/get functions
- Set up TypeScript testing environment with @polkadot/api and @polkadot/api-contract
- Create TypeScript tests in contracts/polkadot/tests/ that deploy and interact with the contract
- Create deployment scripts using cargo-contract or Contracts UI
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a Polkadot testnet (Rococo) wallet with:
- Mnemonic: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] ROC

Deploy the counter contract to Rococo testnet:
- Build the ink! contract with cargo-contract
- Deploy to Rococo contracts pallet
- Run TypeScript tests against deployed contract
- Show me contract address and event logs
```

---

## 11. NEAR

### Phase 1 - Environment Setup & Development
```
Set up a NEAR Protocol development environment in contracts/near/.
- Initialize a NEAR project with Rust and near-sdk-rs
- Create a basic counter contract with increment/decrement/get_value methods
- Set up TypeScript testing environment with near-api-js
- Create TypeScript tests in contracts/near/tests/ that deploy and interact with the contract
- Create deployment scripts using NEAR CLI (near deploy)
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have a funded NEAR testnet wallet with:
- Account ID: [WILL BE PROVIDED]
- Private key: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] NEAR

Deploy the counter contract to NEAR testnet:
- Build the WASM contract
- Deploy to testnet using near deploy
- Run TypeScript tests against deployed contract
- Show me contract account ID and transaction hashes
```

---

## 12. Tezos

### Phase 1 - Environment Setup & Development
```
Set up a Tezos smart contract environment in contracts/tezos/.
- Initialize a Tezos project using SmartPy or Archetype
- Create a basic counter contract in SmartPy with increment/decrement/get_value entrypoints
- Set up TypeScript testing environment with @taquito/taquito
- Create TypeScript tests in contracts/tezos/tests/ that deploy and interact with the contract
- Create deployment scripts using SmartPy CLI or tezos-client
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a Tezos testnet (Ghostnet) wallet with:
- Private key: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] XTZ

Deploy the counter contract to Ghostnet:
- Compile the SmartPy contract
- Deploy to Ghostnet using tezos-client or SmartPy
- Run TypeScript tests against deployed contract
- Show me contract address and operation hashes
```

---

## 13. EOS

### Phase 1 - Environment Setup & Development
```
Set up an EOS smart contract environment in contracts/eos/.
- Initialize an EOSIO project with CDT (Contract Development Toolkit)
- Create a basic counter contract in C++ with increment/decrement/getvalue actions
- Set up TypeScript testing environment with eosjs
- Create TypeScript tests in contracts/eos/tests/ that deploy and interact with the contract
- Create deployment scripts using cleos commands
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have an EOS testnet account with:
- Account name: [WILL BE PROVIDED]
- Private key: [WILL BE PROVIDED]
- CPU/NET/RAM staked: [WILL BE PROVIDED]

Deploy the counter contract to EOS testnet:
- Compile the C++ contract to WASM
- Deploy to testnet account using cleos
- Run TypeScript tests against deployed contract
- Show me contract deployment transaction and action results
```

---

## 14. StarkNet

### Phase 1 - Environment Setup & Development
```
Set up a StarkNet development environment in contracts/starknet/.
- Initialize a StarkNet project with Cairo
- Create a basic counter contract in Cairo with increase_counter/decrease_counter/get_counter functions
- Set up TypeScript testing environment with starknet.js
- Create TypeScript tests in contracts/starknet/tests/ that deploy and interact with the contract
- Create deployment scripts using starknet CLI or Scarb
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a StarkNet testnet (Sepolia) wallet with:
- Private key: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] ETH

Deploy the counter contract to StarkNet Sepolia:
- Compile the Cairo contract
- Declare and deploy to Sepolia using starknet CLI
- Run TypeScript tests against deployed contract
- Show me contract address and transaction hashes
```

---

## General Notes

### Common Requirements for All Chains:
1. Each chain folder should have:
   - `/contracts/[chain]/` - Main project directory
   - `/contracts/[chain]/src/` or `/contracts/[chain]/contracts/` - Contract source code
   - `/contracts/[chain]/tests/` - TypeScript test files
   - `/contracts/[chain]/scripts/` - Deployment scripts (using native tooling)
   - `/contracts/[chain]/.env.example` - Required environment variables
   - `/contracts/[chain]/README.md` - Setup and usage instructions

2. TypeScript test structure:
   - Use descriptive test names
   - Test contract deployment
   - Test all contract functions
   - Include error cases
   - Use proper async/await patterns

3. Environment variables typically needed:
   - Network RPC endpoints
   - Private keys/mnemonics (for Phase 2)
   - Contract addresses (after deployment)
   - Network-specific configurations

### Testing Strategy:
- Phase 1: Local testing with mock networks or local nodes
- Phase 2: Testnet deployment with real transactions

### Success Criteria:
- Contract compiles without errors
- All tests pass locally
- Contract deploys successfully to testnet
- Testnet interactions work as expected

### Deployment Scripts:
- Use native tooling for each blockchain
- Examples:
  - Aptos: `aptos move publish`
  - Sui: `sui client publish`
  - Stellar: `soroban contract deploy`
  - NEAR: `near deploy`
  - etc.

---

## 15. Neutron (Cosmos SDK)

### Phase 1 - Environment Setup & Development
```
Set up a Neutron smart contract development environment in contracts/neutron/.
- Initialize a CosmWasm project with cargo workspace for Neutron
- Create a basic counter contract in Rust that implements increment/decrement/query_count
- Set up TypeScript testing environment with @cosmjs/cosmwasm-stargate and @neutron-org/neutronjs
- Create TypeScript tests in contracts/neutron/tests/ that deploy and interact with the contract
- Create deployment scripts using neutrond CLI or CosmWasm deployment tools
- Configure for Neutron's permissionless smart contract deployment
- List all required environment variables (.env.example)
```

### Phase 2 - Testnet Deployment
```
I have funded a Neutron testnet (Pion) wallet with:
- Mnemonic: [WILL BE PROVIDED]
- Address: [WILL BE PROVIDED]
- Balance: [WILL BE PROVIDED] NTRN

Deploy the counter contract to Neutron Pion testnet:
- Build and optimize the WASM contract using rust-optimizer
- Upload code to Neutron testnet using neutrond
- Instantiate the contract with proper parameters
- Run TypeScript tests against deployed contract
- Test cross-chain features if applicable (IBC queries/transactions)
- Show me code ID, contract address, and transaction hashes
```