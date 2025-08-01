# Cardano Wallet Generation Scripts

This directory contains scripts to generate Cardano preprod wallets using the lucid-cardano library.

## Available Scripts

### 1. `generate-wallet.ts`
Full-featured wallet generation with address derivation using lucid-cardano.

**Usage:**
```bash
npm run generate-wallet
```

**Features:**
- Generates cryptographically secure private keys
- Derives Cardano addresses using lucid-cardano
- Saves wallet information to timestamped JSON files
- Fallback to simple private key generation if lucid-cardano fails

### 2. `generate-wallet-simple.ts`
Simple private key generation without external dependencies.

**Usage:**
```bash
npm run generate-wallet-simple
```

**Features:**
- Generates cryptographically secure private keys using Node.js crypto
- No external dependencies
- Always works regardless of module setup
- Provides instructions for address derivation

### 3. `derive-address.ts`
Derives Cardano addresses from existing private keys.

**Usage:**
```bash
# Using private key directly
npm run derive-address -- --private-key <your_private_key>

# Using wallet file
npm run derive-address -- --wallet-file ./wallets/wallet-preprod-2025-08-01T14-41-31-097Z.json

# Specify network (preprod or mainnet)
npm run derive-address -- --private-key <key> --network preprod
```

## Generated Files

All wallet files are saved in the `wallets/` directory with the following structure:

```json
{
  "privateKey": "8362b47cbd3ee3e92ae06e6f952227de5df627cf3fe63613dde3e132b22dc7c7",
  "address": "addr_test1qr...", 
  "network": "preprod",
  "generatedAt": "2025-08-01T14:41:31.097Z"
}
```

## Security Notes

⚠️ **IMPORTANT SECURITY WARNINGS:**

1. **NEVER share your private keys** with anyone
2. **NEVER commit wallet files** to version control (they're in .gitignore)
3. **Store private keys securely** - they control access to your funds
4. **Use preprod network for testing** - never use mainnet keys for development

## Module Configuration Issue

The current project uses CommonJS (`module.exports`) while lucid-cardano is an ES module. This can cause import issues. If you encounter module resolution errors:

### Quick Fix Options:

1. **Use the simple version**: `npm run generate-wallet-simple` always works
2. **Change tsconfig**: Temporarily modify `tsconfig.json` to use ES modules
3. **Use dynamic imports**: The scripts already handle this with fallbacks

### Long-term Solutions:

1. **Convert project to ES modules**: Change `package.json` to include `"type": "module"`
2. **Use a different lucid version**: Some versions may have better CommonJS compatibility
3. **Create a wrapper script**: Use a separate ES module script to handle lucid-cardano

## Environment Setup

Ensure your `.env` file contains:

```bash
# Required for address derivation
BLOCKFROST_PREPROD_PROJECT_ID=your_preprod_project_id_here

# Optional: For mainnet (use with caution)
BLOCKFROST_MAINNET_PROJECT_ID=your_mainnet_project_id_here
```

Get your Blockfrost project ID from: https://blockfrost.io/

## Next Steps After Wallet Generation

1. **Fund your wallet**: Use the Cardano testnet faucet
   - https://docs.cardano.org/cardano-testnet/tools/faucet/

2. **Add to environment**: Update your `.env` file:
   ```bash
   PREPROD_WALLET_PRIVATE_KEY=your_generated_private_key_here
   ```

3. **Deploy contracts**: Use the private key for contract deployment:
   ```bash
   npm run deploy:preprod
   ```

## Manual Address Derivation

If the scripts fail to derive addresses, you can derive them manually using the Cardano CLI or any Cardano wallet that supports private key import.

### Example with lucid-cardano (in Node.js REPL or separate script):

```javascript
import { Lucid, Blockfrost } from "lucid-cardano";

const provider = new Blockfrost(
  "https://cardano-preprod.blockfrost.io/api/v0",
  "your_project_id"
);

const lucid = await Lucid.new(provider, "Preprod");
lucid.selectWalletFromPrivateKey("your_private_key_here");
const address = await lucid.wallet.address();
console.log("Address:", address);
```

## Troubleshooting

### "ERR_PACKAGE_PATH_NOT_EXPORTED" Error
This indicates a module resolution issue between CommonJS and ES modules. Use the simple wallet generation script as a workaround.

### "BLOCKFROST_PREPROD_PROJECT_ID not set" Error
Add your Blockfrost project ID to the `.env` file.

### "Failed to derive address" Error
The lucid-cardano module couldn't be loaded. Use the simple generation script and derive addresses manually.

## File Structure

```
scripts/
├── README.md                 # This file
├── generate-wallet.ts        # Full-featured wallet generation
├── generate-wallet-simple.ts # Simple private key generation  
├── derive-address.ts         # Address derivation from private keys
├── deploy.ts                 # Contract deployment (existing)
└── build.sh                  # Build script (existing)

wallets/                      # Generated wallet files (git-ignored)
├── wallet-preprod-2025-08-01T14-40-34-597Z.json
└── wallet-preprod-2025-08-01T14-41-31-097Z.json
```