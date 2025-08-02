import { Wallet } from "xrpl";
import fs from "fs";
import path from "path";

interface WalletInfo {
  address: string;
  secret: string;
  description: string;
}

interface EnvironmentConfig {
  xrpl: {
    serverUrl: string;
    networkType: string;
  };
  evm: {
    baseSepoliaRpc: string;
    chainId: number;
  };
  wallets: {
    user: WalletInfo;
    resolvers: WalletInfo[];
    relayer?: WalletInfo;
  };
  contracts: {
    base_sepolia: {
      [key: string]: string;
    };
  };
}

async function setupEnvironment(): Promise<void> {
  console.log("🚀 Setting up XRPL Cross-Chain Environment");

  // Generate XRPL wallets
  const userWallet = Wallet.generate();
  const resolver1 = Wallet.generate();
  const resolver2 = Wallet.generate(); 
  const resolver3 = Wallet.generate();
  const relayerWallet = Wallet.generate();

  const config: EnvironmentConfig = {
    xrpl: {
      serverUrl: "wss://s.altnet.rippletest.net:51233",
      networkType: "testnet"
    },
    evm: {
      baseSepoliaRpc: "https://sepolia.base.org",
      chainId: 84532
    },
    wallets: {
      user: {
        address: userWallet.address,
        secret: userWallet.seed!,
        description: "User wallet for cross-chain swaps"
      },
      resolvers: [
        {
          address: resolver1.address,
          secret: resolver1.seed!,
          description: "Resolver 1 - Primary liquidity provider"
        },
        {
          address: resolver2.address,
          secret: resolver2.seed!,
          description: "Resolver 2 - Secondary liquidity provider"
        },
        {
          address: resolver3.address,
          secret: resolver3.seed!,
          description: "Resolver 3 - Tertiary liquidity provider"
        }
      ],
      relayer: {
        address: relayerWallet.address,
        secret: relayerWallet.seed!,
        description: "Relayer for coordinating cross-chain operations"
      }
    },
    contracts: {
      base_sepolia: {
        UniteLimitOrderProtocol: "0x1234567890123456789012345678901234567890",
        UniteEscrowFactory: "0x2345678901234567890123456789012345678901",
        UniteResolver0: "0x3456789012345678901234567890123456789012",
        UniteResolver1: "0x4567890123456789012345678901234567890123", 
        UniteResolver2: "0x5678901234567890123456789012345678901234",
        MockUSDT: "0x97a2d8Dfece96252518a4327aFFf40B61A0a025A",
        MockDAI: "0x6789012345678901234567890123456789012345"
      }
    }
  };

  // Create .env file
  const envContent = `# XRPL Cross-Chain Environment Configuration
# Generated on ${new Date().toISOString()}

# XRPL Configuration
XRP_SERVER_URL=${config.xrpl.serverUrl}
XRP_NETWORK=${config.xrpl.networkType}

# User Wallet
XRP_USER_ADDRESS=${config.wallets.user.address}
XRP_USER_SECRET=${config.wallets.user.secret}

# Resolver Wallets
XRP_RESOLVER_0_ADDRESS=${config.wallets.resolvers[0].address}
XRP_RESOLVER_0_SECRET=${config.wallets.resolvers[0].secret}

XRP_RESOLVER_1_ADDRESS=${config.wallets.resolvers[1].address}
XRP_RESOLVER_1_SECRET=${config.wallets.resolvers[1].secret}

XRP_RESOLVER_2_ADDRESS=${config.wallets.resolvers[2].address}
XRP_RESOLVER_2_SECRET=${config.wallets.resolvers[2].secret}

# Relayer Wallet  
XRP_RELAYER_ADDRESS=${config.wallets.relayer!.address}
XRP_RELAYER_SECRET=${config.wallets.relayer!.secret}

# EVM Configuration (Base Sepolia)
BASE_SEPOLIA_RPC_URL=${config.evm.baseSepoliaRpc}
BASE_SEPOLIA_CHAIN_ID=${config.evm.chainId}

# EVM Wallets (reuse XRPL user for simplicity in testing)
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
RESOLVER_PRIVATE_KEY_0=0x2345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef1
RESOLVER_PRIVATE_KEY_1=0x3456789012cdef123456789012cdef123456789012cdef123456789012cdef12
RESOLVER_PRIVATE_KEY_2=0x456789013def1234567890123def1234567890123def1234567890123def123

# Contract Addresses (Base Sepolia)
UNITE_LIMIT_ORDER_PROTOCOL=${config.contracts.base_sepolia.UniteLimitOrderProtocol}
UNITE_ESCROW_FACTORY=${config.contracts.base_sepolia.UniteEscrowFactory}
UNITE_RESOLVER_0=${config.contracts.base_sepolia.UniteResolver0}
UNITE_RESOLVER_1=${config.contracts.base_sepolia.UniteResolver1}
UNITE_RESOLVER_2=${config.contracts.base_sepolia.UniteResolver2}
MOCK_USDT=${config.contracts.base_sepolia.MockUSDT}
MOCK_DAI=${config.contracts.base_sepolia.MockDAI}

# Test Configuration
TEST_TIMEOUT=120000
ENABLE_LOGGING=true
`;

  // Write configuration files
  const configDir = path.join(__dirname, "..", "config");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(path.join(__dirname, "..", ".env"), envContent);
  fs.writeFileSync(
    path.join(configDir, "generated-config.json"), 
    JSON.stringify(config, null, 2)
  );

  console.log("✅ Environment configuration generated");
  console.log("\n📁 Files created:");
  console.log("- .env (environment variables)");
  console.log("- config/generated-config.json (full configuration)");

  console.log("\n🎯 Next Steps:");
  console.log("1. Fund XRPL wallets using testnet faucet:");
  console.log("   https://xrpl.org/xrp-testnet-faucet.html");
  console.log("\n2. Fund these XRPL addresses with at least 100 XRP each:");
  console.log(`   User: ${config.wallets.user.address}`);
  config.wallets.resolvers.forEach((resolver, i) => {
    console.log(`   Resolver ${i + 1}: ${resolver.address}`);
  });
  console.log(`   Relayer: ${config.wallets.relayer!.address}`);

  console.log("\n3. Fund EVM wallets on Base Sepolia:");
  console.log("   https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");

  console.log("\n4. Run tests:");
  console.log("   npm test");
}

if (require.main === module) {
  setupEnvironment().catch(console.error);
}

export { setupEnvironment };
