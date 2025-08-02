# Unite Protocol - Sui Implementation

🌉 Cross-chain atomic swaps between EVM and Sui networks using HTLC (Hash Time Locked Contracts).

## Overview

This implementation enables trustless cross-chain swaps between:
- **EVM chains** (Base Sepolia, Arbitrum Sepolia, Ethereum Sepolia) ↔ **Sui Testnet/Mainnet**
- **ERC20 tokens** ↔ **SUI native token**
- **Multiple resolvers** providing liquidity with partial fills
- **Permissionless withdrawals** with secret reveal mechanism

## Architecture

### Core Contracts

1. **EscrowFactory** (`escrow_factory.move`)
   - Creates and manages source/destination escrows
   - Tracks resolver participation and partial fills
   - Handles safety deposit management

2. **Escrow** (`escrow.move`)
   - HTLC implementation for SUI tokens
   - Supports multiple resolvers with partial amounts
   - Permissionless withdrawals with secret
   - Time-based cancellation mechanisms

3. **LimitOrderProtocol** (`limit_order_protocol.move`)
   - Order creation and validation
   - Dutch auction pricing mechanism
   - Cross-chain order coordination

4. **Resolver** (`resolver.move`)
   - Helper contract for resolvers
   - Simplifies escrow deployment and management
   - Handles token deposits and withdrawals

5. **MockUSDC** (`mock_usdc.move`)
   - Test token for cross-chain swaps
   - Permissionless minting for testing

## Setup

### Prerequisites

- Node.js v18+
- Sui CLI installed
- TypeScript
- Jest for testing

### Installation

```bash
# Install dependencies
cd contracts/sui
npm install

# Install Sui CLI (if not already installed)
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch testnet sui
```

### Environment Configuration

Create `.env` file in the `sui/` directory:

```bash
# Sui Configuration
SUI_RPC_URL=https://fullnode.testnet.sui.io
SUI_NETWORK=testnet
SUI_PRIVATE_KEY=your_32_byte_hex_private_key

# Resolver private keys for testing
SUI_RESOLVER_PRIVATE_KEY_0=resolver1_private_key
SUI_RESOLVER_PRIVATE_KEY_1=resolver2_private_key
SUI_RESOLVER_PRIVATE_KEY_2=resolver3_private_key

# EVM Configuration (for cross-chain tests)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_evm_private_key
RESOLVER_PRIVATE_KEY_0=resolver1_evm_key
RESOLVER_PRIVATE_KEY_1=resolver2_evm_key
RELAYER_PRIVATE_KEY=relayer_evm_key
```

### Generate Wallet

```bash
# Generate new Sui wallet
npm run generate-wallet

# Fund the wallet with testnet SUI
# Visit: https://faucet.testnet.sui.io
```

## Deployment

### Deploy to Sui Testnet

```bash
# Build and deploy all contracts
npm run deploy:testnet

# Or deploy to devnet
npm run deploy:devnet
```

This will:
1. Build Move packages
2. Deploy all contracts
3. Create resolver instances
4. Update `deployments.json` with addresses

### Fund Resolvers

```bash
# Fund resolver accounts with SUI and test tokens
npm run fund-resolvers
```

## Testing

### Unit Tests

```bash
# Run Sui-specific unit tests
npm run test:unit
```

### Cross-Chain Integration Tests

```bash
# Run full cross-chain swap tests (Base Sepolia <> Sui Testnet)
npm run test:cross-chain
```

The cross-chain test demonstrates:
1. **Order Creation**: User creates signed order on Base Sepolia
2. **Source Escrows**: Resolvers deploy escrows on Base Sepolia with USDT
3. **Destination Escrows**: Resolvers deploy escrows on Sui with SUI
4. **Token Deposits**: Resolvers deposit their tokens to escrows
5. **User Funding**: Relayer transfers user USDT to source escrow
6. **Secret Reveal**: Secret is revealed publicly
7. **Withdrawals**: Permissionless withdrawals execute on both chains
8. **Settlement**: User gets SUI, resolvers get USDT proportionally

## Usage Example

### Basic Cross-Chain Swap Flow

```typescript
import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";

// 1. Setup clients and wallets
const suiClient = new SuiClient({ url: "https://fullnode.testnet.sui.io" });
const userKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));

// 2. Create destination escrow on Sui
const tx = new TransactionBlock();
tx.moveCall({
  target: `${packageId}::escrow_factory::create_dst_escrow_partial`,
  arguments: [
    tx.object(factoryId),
    tx.pure(orderHashBytes),
    tx.pure(hashlockBytes),
    // ... other parameters
  ],
});

// 3. Deposit SUI tokens
tx.moveCall({
  target: `${packageId}::escrow::deposit_sui_tokens`,
  arguments: [
    tx.object(escrowId),
    suiCoin,
  ],
});

// 4. Withdraw with secret (permissionless)
tx.moveCall({
  target: `${packageId}::escrow::withdraw_sui_with_secret`,
  arguments: [
    tx.object(escrowId),
    tx.pure(secretBytes),
    tx.object("0x6"), // Clock
  ],
});
```

## Contract Addresses

After deployment, addresses are stored in `deployments.json`:

```json
{
  "sui": {
    "testnet": {
      "packageId": "0x...",
      "LimitOrderProtocol": "0x...",
      "EscrowFactory": "0x...",
      "MockUSDC": "0x...",
      "Resolver0": "0x...",
      "Resolver1": "0x...",
      "Resolver2": "0x..."
    }
  }
}
```

## Security Features

### Time-based Controls
- **No time limits** for withdrawal with secret
- **Public withdrawal incentives** after 15 minutes
- **Cancellation windows** (30min source, 45min destination)
- **Public cancellation** after 1 hour

### Safety Mechanisms
- **Safety deposits** from resolvers (proportional to commitment)
- **Caller rewards** (10% of safety deposits for late withdrawals)
- **Atomic execution** (all-or-nothing settlement)
- **Permissionless operations** (anyone can trigger with secret)

### Multi-Resolver Support
- **Partial fills** by multiple resolvers
- **Proportional distribution** of tokens and deposits
- **Independent resolver participation**
- **Collective liquidity provision**

## Cross-Chain Support

### Supported Networks
- **Base Sepolia** ↔ Sui Testnet
- **Arbitrum Sepolia** ↔ Sui Testnet
- **Ethereum Sepolia** ↔ Sui Testnet

### Token Pairs
- USDT (Base) ↔ SUI (Sui)
- DAI (Arbitrum) ↔ SUI (Sui)
- Custom ERC20 ↔ SUI (Sui)

## Development

### Build Move Packages

```bash
# Build only
npm run build

# Clean build artifacts
npm run clean
```

### Code Quality

```bash
# Lint TypeScript
npm run lint

# Format code
npm run format
```

## Troubleshooting

### Common Issues

1. **Insufficient Gas**: Ensure accounts have enough SUI for transactions
2. **Object Not Found**: Verify escrow object IDs from deployment
3. **Secret Mismatch**: Ensure secret bytes match the hashlock
4. **Time Windows**: Check if operations are within valid time windows

### Debugging

```bash
# Check object details
sui client object <object-id> --json

# View transaction details
sui client tx-block <tx-digest> --json

# Check account balance
sui client balance
```

## Resources

- [Sui Documentation](https://docs.sui.io/)
- [Move Language Guide](https://move-language.github.io/move/)
- [Sui Explorer](https://suiexplorer.com/)
- [Testnet Faucet](https://faucet.testnet.sui.io/)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.