# 🌉 Cross-Chain Dutch Auction Transaction Flow

## Overview
This demonstrates the complete transaction flow for a **Dutch Auction Cross-Chain Swap** using Unite Protocol where **3 resolvers** partially fill a single order at **different prices** based on **timing**.

## Scenario
- **User wants**: 100 USDT (Base Sepolia) → 99 DAI (Arbitrum Sepolia)
- **Dutch Auction**: Price starts at 0.99 DAI/USDT, decreases to 0.97 DAI/USDT over 10 minutes
- **3 Resolvers**: Fill 40 USDT, 25 USDT, and 35 USDT at different times

---

## 📋 Phase 1: Source Chain Transactions (Base Sepolia)

### Transaction 1: Resolver 1 (Immediate Fill - t=0)
```
📝 Transaction: deploySrcCompactPartial()
⛽ Gas: ~800,000
💰 ETH Cost: ~0.0008 ETH
🔗 Chain: Base Sepolia
📊 Amount: 40 USDT
💎 Price: 0.99 DAI/USDT (worst price - early bird pays more)
🔒 Safety Deposit: 0.04 ETH
📈 Expected DAI: 39.6 DAI
```

**What happens:**
1. Resolver 1 calls `UniteResolver.deploySrcCompactPartial()`
2. UniteResolver calls `UniteEscrowFactory.createSrcEscrowPartialFor()`
3. Factory deploys new escrow at deterministic address
4. UniteResolver calls `UniteLimitOrderProtocol.fillOrderArgs()`
5. LOP calculates current price (0.99 DAI/USDT at t=0)
6. LOP transfers 40 USDT from user to escrow
7. LOP records: `filledAmounts[orderHash] = 40 USDT`

### Transaction 2: Resolver 2 (3 minutes later - t=3min)
```
📝 Transaction: deploySrcCompactPartial()
⛽ Gas: ~600,000 (escrow exists, cheaper)
💰 ETH Cost: ~0.0006 ETH
🔗 Chain: Base Sepolia
📊 Amount: 25 USDT
💎 Price: 0.988 DAI/USDT (better price)
🔒 Safety Deposit: 0.025 ETH
📈 Expected DAI: 24.7 DAI
```

**What happens:**
1. Resolver 2 calls same function but 3 minutes later
2. Factory detects escrow already exists at same address
3. Factory adds Resolver 2 to existing escrow
4. LOP calculates current price (0.988 DAI/USDT at t=3min)
5. LOP transfers 25 USDT to same escrow
6. LOP records: `filledAmounts[orderHash] = 65 USDT`

### Transaction 3: Resolver 3 (6 minutes later - t=6min)
```
📝 Transaction: deploySrcCompactPartial()
⛽ Gas: ~600,000
💰 ETH Cost: ~0.0006 ETH
🔗 Chain: Base Sepolia
📊 Amount: 35 USDT
💎 Price: 0.986 DAI/USDT (best price - late bird wins)
🔒 Safety Deposit: 0.035 ETH
📈 Expected DAI: 34.51 DAI
```

**What happens:**
1. Resolver 3 gets the best price for waiting
2. Same escrow address, same process
3. LOP records: `filledAmounts[orderHash] = 100 USDT`
4. Order is now fully filled

---

## 🌉 Phase 2: Destination Chain Transactions (Arbitrum Sepolia)

### Transaction 4: Resolver 1 Destination Deposit
```
📝 Transaction: deployDstPartial()
⛽ Gas: ~500,000
💰 ETH Cost: ~0.0001 ETH (Arbitrum is cheaper)
🔗 Chain: Arbitrum Sepolia
📊 Amount: 39.6 DAI deposit
🔒 Safety Deposit: 0.04 ETH
```

**What happens:**
1. Resolver 1 approves 39.6 DAI to UniteResolver
2. Resolver 1 calls `deployDstPartial()`
3. Factory deploys destination escrow at same deterministic address
4. Factory transfers 39.6 DAI from Resolver 1 to escrow
5. Resolver 1 deposits 0.04 ETH safety deposit

### Transaction 5-6: Resolver 2 & 3 Destination Deposits
```
📝 Similar transactions for Resolver 2 & 3
💰 Resolver 2: 24.7 DAI + 0.025 ETH
💰 Resolver 3: 34.51 DAI + 0.035 ETH
💎 Total in destination escrow: 98.81 DAI
```

---

## 🎯 Phase 3: Withdrawal Transactions

### Transaction 7: User Withdrawal (Arbitrum Sepolia)
```
📝 Transaction: withdrawUser()
⛽ Gas: ~200,000
💰 ETH Cost: ~0.00002 ETH
🔗 Chain: Arbitrum Sepolia
🎁 User Gets: 98.81 DAI
🔓 Reveals: Secret for HTLC
```

**What happens:**
1. User calls `UniteEscrow.withdrawUser()` with secret
2. Escrow verifies secret matches hashlock
3. Escrow transfers 98.81 DAI to user
4. Sets `userWithdrawn = true`

### Transactions 8-10: Resolver Withdrawals (Base Sepolia)
```
📝 Transaction: withdrawResolver()
⛽ Gas: ~150,000 each
💰 ETH Cost: ~0.00015 ETH each
🔗 Chain: Base Sepolia

Resolver 1 Gets: 40 USDT + 0.04 ETH back
Resolver 2 Gets: 25 USDT + 0.025 ETH back  
Resolver 3 Gets: 35 USDT + 0.035 ETH back
```

---

## 📊 Final Results

### Dutch Auction Price Differences
| Resolver | Time | Price/USDT | USDT Amount | DAI Amount | Rate |
|----------|------|------------|-------------|------------|------|
| 1 | t=0min | 0.99 | 40 | 39.6 | Worst |
| 2 | t=3min | 0.988 | 25 | 24.7 | Medium |
| 3 | t=6min | 0.986 | 35 | 34.51 | Best |
| **Total** | - | **0.9881** | **100** | **98.81** | **Average** |

### Gas Cost Summary
| Chain | Transactions | Total Gas | Est. Cost |
|-------|--------------|-----------|-----------|
| Base Sepolia | 6 txns | ~2.4M gas | ~0.0024 ETH |
| Arbitrum Sepolia | 4 txns | ~1.2M gas | ~0.00012 ETH |
| **Total** | **10 txns** | **3.6M gas** | **~0.00252 ETH** |

### Key Features Demonstrated
✅ **Dutch Auction Pricing**: Earlier = More Expensive, Later = Cheaper  
✅ **Cross-Chain Coordination**: Transactions on both Base & Arbitrum  
✅ **Partial Order Filling**: 3 resolvers fill 1 order  
✅ **Deterministic Addresses**: Same escrow address on both chains  
✅ **Proportional Safety Deposits**: Risk scales with fill amount  
✅ **HTLC Security**: Secret reveals enable atomic swaps  
✅ **Gas Efficiency**: Shared escrows reduce deployment costs  

---

## 🔗 Explorer Links

**Base Sepolia**: https://sepolia.basescan.org  
**Arbitrum Sepolia**: https://sepolia.arbiscan.io

## 📝 Smart Contracts

- **UniteLimitOrderProtocol**: Dutch auction + partial filling
- **UniteEscrowFactory**: Deterministic escrow deployment  
- **UniteEscrow**: Multi-resolver HTLC management
- **UniteResolver**: Cross-chain coordination

---

*This flow demonstrates the power of Unite Protocol's Dutch auction mechanism where resolvers are incentivized to find the optimal entry time balancing profit margins with competition risk.*