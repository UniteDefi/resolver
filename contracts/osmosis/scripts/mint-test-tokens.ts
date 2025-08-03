import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

interface TokenConfig {
  contract: string;
  symbol: string;
  decimals: number;
}

async function mintTestTokens() {
  // Load configuration
  const deployments = JSON.parse(fs.readFileSync("deployments.json", "utf-8"));
  const tokens: TokenConfig[] = [
    { contract: deployments.OSMOSIS_MOCK_USDT, symbol: "MUSDT", decimals: 6 },
    { contract: deployments.OSMOSIS_MOCK_DAI, symbol: "MDAI", decimals: 18 },
    { contract: deployments.OSMOSIS_MOCK_WRAPPED_NATIVE, symbol: "MWOSMO", decimals: 6 }
  ];

  // Get wallets from environment
  const userMnemonic = process.env.OSMO_USER_MNEMONIC || process.env.OSMO_TESTNET_MNEMONIC;
  const resolverMnemonics = [
    process.env.OSMO_RESOLVER_MNEMONIC_0,
    process.env.OSMO_RESOLVER_MNEMONIC_1,
    process.env.OSMO_RESOLVER_MNEMONIC_2
  ].filter(Boolean);

  if (!userMnemonic) {
    throw new Error("OSMO_TESTNET_MNEMONIC or OSMO_USER_MNEMONIC required");
  }

  if (resolverMnemonics.length === 0) {
    console.warn("No resolver mnemonics found, minting only to user wallet");
  }

  // Connect to Osmosis
  const rpcEndpoint = process.env.OSMO_TESTNET_RPC || "https://rpc.testnet.osmosis.zone";
  const gasPrice = GasPrice.fromString("0.025uosmo");

  // Setup user wallet
  const userWallet = await DirectSecp256k1HdWallet.fromMnemonic(userMnemonic, { prefix: "osmo" });
  const [userAccount] = await userWallet.getAccounts();
  const userClient = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, userWallet, { gasPrice });

  console.log("User wallet:", userAccount.address);

  // Mint amounts
  const mintAmounts = {
    MUSDT: "1000000000", // 1000 USDT (6 decimals)
    MDAI: "1000000000000000000000", // 1000 DAI (18 decimals)
    MWOSMO: "1000000000" // 1000 WOSMO (6 decimals)
  };

  // Mint to user wallet
  console.log("\n=== Minting tokens to user wallet ===");
  for (const token of tokens) {
    if (!token.contract) {
      console.warn(`${token.symbol} contract not deployed, skipping...`);
      continue;
    }

    try {
      const mintMsg = {
        mint: {
          recipient: userAccount.address,
          amount: mintAmounts[token.symbol]
        }
      };

      const result = await userClient.execute(
        userAccount.address,
        token.contract,
        mintMsg,
        "auto",
        `Mint ${token.symbol}`
      );

      console.log(`✅ Minted ${token.symbol} to user wallet - tx: ${result.transactionHash}`);
    } catch (error) {
      console.error(`❌ Failed to mint ${token.symbol} to user:`, error.message);
    }
  }

  // Mint to resolver wallets
  for (let i = 0; i < resolverMnemonics.length; i++) {
    console.log(`\n=== Minting tokens to resolver ${i} ===`);
    
    const resolverWallet = await DirectSecp256k1HdWallet.fromMnemonic(resolverMnemonics[i], { prefix: "osmo" });
    const [resolverAccount] = await resolverWallet.getAccounts();
    const resolverClient = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, resolverWallet, { gasPrice });
    
    console.log(`Resolver ${i} wallet:`, resolverAccount.address);

    for (const token of tokens) {
      if (!token.contract) continue;

      try {
        // For MockWrappedNative, use FakeMint for resolvers
        const mintMsg = token.symbol === "MWOSMO" ? {
          fake_mint: {
            recipient: resolverAccount.address,
            amount: mintAmounts[token.symbol]
          }
        } : {
          mint: {
            recipient: resolverAccount.address,
            amount: mintAmounts[token.symbol]
          }
        };

        const result = await resolverClient.execute(
          resolverAccount.address,
          token.contract,
          mintMsg,
          "auto",
          `Mint ${token.symbol}`
        );

        console.log(`✅ Minted ${token.symbol} to resolver ${i} - tx: ${result.transactionHash}`);
      } catch (error) {
        console.error(`❌ Failed to mint ${token.symbol} to resolver ${i}:`, error.message);
      }
    }
  }

  console.log("\n✅ Token minting completed!");
}

// Execute minting
mintTestTokens().catch(console.error);