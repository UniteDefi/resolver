# Unite Protocol Deployment Summary

## Successfully Deployed Chains

### 1. Ethereum Sepolia (eth_sepolia)
- Chain ID: 11155111
- Status: ✅ Deployed & Funded
- UniteLimitOrderProtocol: 0x7871F66B42959cA21a1E0f1184Ce17Cd5d4b4Cf8
- UniteEscrowFactory: 0xcD0c8F55f7131F62B86728d13EeCb683091A7Ee1
- UniteResolver0: 0xbe4eEaBd99f8efC30eDCda8D3ff1ac7435dBEF0a
- UniteResolver1: 0x432F056De2D597FA9205731671472Fc22ab9F392

### 2. Etherlink Testnet (etherlink_testnet)
- Chain ID: 128123
- Status: ✅ Deployed & Funded (partial)
- UniteLimitOrderProtocol: 0xF05fC725206A9D96AF8a5e6A55665C1e9B35Cea0
- UniteEscrowFactory: 0x06300658371f2303313b9DaCDD0106D05b40f168
- UniteResolver0: 0x4f8fff737827419CD631699054060fB84098fff0
- UniteResolver1: 0x1dF7C15a516133ac77fFf1D5502776E8bFec0089

### 3. Monad Testnet (monad_testnet)
- Chain ID: 10143
- Status: ✅ Deployed & Funded
- UniteLimitOrderProtocol: 0x0b6FB370E9323CE7e97E2F2E7572F7ee24d51dEb
- UniteEscrowFactory: 0x891cA74824A64fC59a4c4d77fdd97908Ec3C99Ed
- UniteResolver0: 0xa25c1Fc7c36b37CB12a8F39056ba0ba1Aea49223
- UniteResolver1: 0xe0d6418957a6b6C5e30A61952F0717BBc425BFe9

### 4. Aurora Testnet (aurora_testnet)
- Chain ID: 1313161555
- Status: ✅ Deployed (Not funded - insufficient balance)
- UniteLimitOrderProtocol: 0x4797b6f76B347cf6c42C2Ae7686909FDE3C3AfBc
- UniteEscrowFactory: 0x4E7c0b62EBDBFc0bC02e47FCFD517A5Ca22D7286
- UniteResolver0: 0x9534aA529da38b74577474aBBD5B0296ae834011
- UniteResolver1: 0x694273F2FaE10d36D552086Ce3c6172a8707eF43

### 5. Optimism Sepolia (op_sepolia)
- Chain ID: 11155420
- Status: ✅ Deployed & Funded
- UniteLimitOrderProtocol: 0x4E7c0b62EBDBFc0bC02e47FCFD517A5Ca22D7286
- UniteEscrowFactory: 0x9534aA529da38b74577474aBBD5B0296ae834011
- UniteResolver0: 0x694273F2FaE10d36D552086Ce3c6172a8707eF43
- UniteResolver1: 0xF05fC725206A9D96AF8a5e6A55665C1e9B35Cea0

### 6. Polygon Amoy (polygon_amoy)
- Chain ID: 80002
- Status: ✅ Deployed & Funded
- UniteLimitOrderProtocol: 0x694273F2FaE10d36D552086Ce3c6172a8707eF43
- UniteEscrowFactory: 0xF05fC725206A9D96AF8a5e6A55665C1e9B35Cea0
- UniteResolver0: 0x06300658371f2303313b9DaCDD0106D05b40f168
- UniteResolver1: 0x4f8fff737827419CD631699054060fB84098fff0

### 7. Scroll Sepolia (scroll_sepolia)
- Chain ID: 534351
- Status: ✅ Deployed & Funded
- UniteLimitOrderProtocol: 0x4E7c0b62EBDBFc0bC02e47FCFD517A5Ca22D7286
- UniteEscrowFactory: 0x9534aA529da38b74577474aBBD5B0296ae834011
- UniteResolver0: 0x694273F2FaE10d36D552086Ce3c6172a8707eF43
- UniteResolver1: 0xF05fC725206A9D96AF8a5e6A55665C1e9B35Cea0

### 8. Celo Alfajores (celo_alfajores)
- Chain ID: 44787
- Status: ✅ Deployed & Funded
- UniteLimitOrderProtocol: 0x4E7c0b62EBDBFc0bC02e47FCFD517A5Ca22D7286
- UniteEscrowFactory: 0x9534aA529da38b74577474aBBD5B0296ae834011
- UniteResolver0: 0x694273F2FaE10d36D552086Ce3c6172a8707eF43
- UniteResolver1: 0xF05fC725206A9D96AF8a5e6A55665C1e9B35Cea0

### 9. Unichain Sepolia (unichain_sepolia)
- Chain ID: 1301
- Status: ✅ Deployed & Funded
- UniteLimitOrderProtocol: 0x4E7c0b62EBDBFc0bC02e47FCFD517A5Ca22D7286
- UniteEscrowFactory: 0x9534aA529da38b74577474aBBD5B0296ae834011
- UniteResolver0: 0x694273F2FaE10d36D552086Ce3c6172a8707eF43
- UniteResolver1: 0xF05fC725206A9D96AF8a5e6A55665C1e9B35Cea0

## Existing Deployments (Do Not Touch)

### Base Sepolia (base_sepolia)
- Chain ID: 84532
- Status: ✅ Already deployed

### Arbitrum Sepolia (arb_sepolia) 
- Chain ID: 421614
- Status: ✅ Already deployed

## Pending/Failed Deployments

### BNB Testnet (bnb_testnet)
- Chain ID: 97
- Status: ❌ Failed - No RPC URL configured

### Flow Testnet (flow_testnet)
- Chain ID: 545
- Status: ⏳ Pending - Deployment timed out

### Sei Testnet (sei_testnet)
- Chain ID: 1328 (not 713715 as expected)
- Status: ⚠️ Partially deployed - Addresses appear to be duplicated

### Injective Testnet (injective_testnet)
- Chain ID: 1439 (not 2424 as expected)
- Status: ⏳ Not attempted yet

## Notes

1. All deployments use only 2 resolvers instead of 4 to save gas
2. Mock tokens deployed: USDT (6 decimals), DAI (18 decimals), WrappedNative (18 decimals)
3. Funding amounts:
   - Expensive chains (ETH Sepolia): 0.001 ETH per resolver
   - Medium chains (BNB, OP, Polygon, Aurora): 0.01 ETH per resolver
   - Cheap chains: 0.05 ETH per resolver
   - Test user gets half the resolver amount

4. Some chains are showing duplicate addresses which might indicate CREATE2 deployment or deployment issues

5. Aurora testnet doesn't support EIP-1559, requires legacy transactions

6. Contract verification was skipped as per user request