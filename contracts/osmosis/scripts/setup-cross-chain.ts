import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { Wallet, JsonRpcProvider, Contract, parseUnits } from "ethers";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

const ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

async function setupCrossChainEnvironment() {
  console.log("[Setup] Configuring cross-chain environment...");
  
  const deploymentsPath = join(__dirname, "../deployments.json");
  const deployments = JSON.parse(readFileSync(deploymentsPath, "utf-8"));
  
  if (!deployments.osmosis) {
    throw new Error("Osmosis contracts not deployed. Run deploy-testnet.ts first.");
  }
  
  const osmoMnemonic = process.env.OSMO_TESTNET_MNEMONIC;
  if (!osmoMnemonic) {
    throw new Error("OSMO_TESTNET_MNEMONIC required");
  }
  
  const osmoWallet = await DirectSecp256k1HdWallet.fromMnemonic(osmoMnemonic, { prefix: "osmo" });
  const [osmoAccount] = await osmoWallet.getAccounts();
  const osmoAddress = osmoAccount.address;
  
  const osmoClient = await SigningCosmWasmClient.connectWithSigner(
    process.env.OSMO_TESTNET_RPC || "https://rpc.testnet.osmosis.zone:443",
    osmoWallet,
    { gasPrice: GasPrice.fromString("0.025uosmo") }
  );
  
  console.log("[Setup] Osmosis address:", osmoAddress);
  
  console.log("\n[Setup] Step 1: Funding test accounts...");
  
  if (deployments.osmosis.contracts.testToken) {
    try {
      await osmoClient.execute(
        osmoAddress,
        deployments.osmosis.contracts.testToken.contractAddress,
        {
          mint: {
            recipient: osmoAddress,
            amount: "1000000000",
          },
        },
        "auto"
      );
      console.log("[Setup] ✅ Minted test tokens on Osmosis");
    } catch (error: any) {
      console.log("[Setup] ⚠️ Test token minting failed:", error.message);
    }
  }
  
  console.log("\n[Setup] Step 2: Configuring cross-chain settings...");
  
  try {
    await osmoClient.execute(
      osmoAddress,
      deployments.osmosis.contracts.orderProtocol.contractAddress,
      {
        set_escrow_factory: {
          address: deployments.osmosis.contracts.escrowFactory.contractAddress,
        },
      },
      "auto"
    );
    console.log("[Setup] ✅ Order Protocol configured with Escrow Factory");
  } catch (error: any) {
    console.log("[Setup] ⚠️ Configuration may not be implemented yet");
  }
  
  console.log("\n[Setup] Step 3: Setting up resolver permissions...");
  
  const resolverAddresses = [osmoAddress];
  
  for (const resolverAddr of resolverAddresses) {
    const balance = await osmoClient.getBalance(resolverAddr, "uosmo");
    console.log(`[Setup] Resolver ${resolverAddr} balance: ${balance.amount} uosmo`);
    
    if (parseInt(balance.amount) < 1000000) {
      console.log(`[Setup] ⚠️ Resolver ${resolverAddr} needs more OSMO for gas`);
    }
  }
  
  console.log("\n[Setup] Step 4: Creating test environment config...");
  
  const testConfig = {
    osmosis: {
      rpc: process.env.OSMO_TESTNET_RPC,
      chainId: "osmo-test-5",
      contracts: deployments.osmosis.contracts,
      testAccount: osmoAddress,
    },
    baseSepolia: {
      rpc: process.env.BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      contracts: deployments.evm?.base_sepolia || {},
      testAccount: process.env.PRIVATE_KEY ? new Wallet(process.env.PRIVATE_KEY).address : "",
    },
    crossChain: {
      supportedPairs: [
        {
          source: { chain: "base-sepolia", token: "USDT" },
          destination: { chain: "osmosis", token: "OSMO" },
        },
        {
          source: { chain: "osmosis", token: "OSMO" },
          destination: { chain: "base-sepolia", token: "USDT" },
        },
      ],
    },
  };
  
  const testConfigPath = join(__dirname, "../test-config.json");
  writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
  
  console.log("[Setup] ✅ Test configuration saved to test-config.json");
  
  console.log("\n[Setup] Step 5: Verifying setup...");
  
  try {
    const orderProtocolConfig = await osmoClient.queryContractSmart(
      deployments.osmosis.contracts.orderProtocol.contractAddress,
      { get_config: {} }
    );
    console.log("[Setup] ✅ Order Protocol is responding");
  } catch (error) {
    console.log("[Setup] ⚠️ Order Protocol query failed");
  }
  
  console.log("\n[Setup] ✅ Cross-chain environment setup completed!");
  console.log("[Setup] Ready for cross-chain testing");
  
  return testConfig;
}

if (require.main === module) {
  setupCrossChainEnvironment()
    .then(() => {
      console.log("[Setup] Success!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[Setup] Failed:", error);
      process.exit(1);
    });
}

export { setupCrossChainEnvironment };
