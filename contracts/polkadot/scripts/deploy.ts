import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { ContractPromise } from "@polkadot/api-contract";
import { BN } from "@polkadot/util";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface DeploymentConfig {
  wsUrl: string;
  deployerMnemonic: string;
  initialValue: number;
  network: string;
}

async function getDeploymentConfig(): Promise<DeploymentConfig> {
  const network = process.env.NETWORK || "local";
  
  const config: DeploymentConfig = {
    wsUrl: process.env.SUBSTRATE_WS_URL || "ws://127.0.0.1:9944",
    deployerMnemonic: process.env.DEPLOYER_MNEMONIC || "//Alice",
    initialValue: parseInt(process.env.INITIAL_COUNTER_VALUE || "0"),
    network
  };

  if (network === "testnet") {
    config.wsUrl = process.env.TESTNET_WS_URL || "wss://westend-rpc.polkadot.io";
  } else if (network === "mainnet") {
    config.wsUrl = process.env.MAINNET_WS_URL || "wss://rpc.polkadot.io";
  }

  return config;
}

async function deployContract(config: DeploymentConfig): Promise<void> {
  console.log("[Deploy] Starting deployment to", config.network);
  console.log("[Deploy] WS URL:", config.wsUrl);
  console.log("[Deploy] Initial value:", config.initialValue);

  const wsProvider = new WsProvider(config.wsUrl);
  const api = await ApiPromise.create({ provider: wsProvider });
  
  console.log("[Deploy] Connected to chain:", (await api.rpc.system.chain()).toString());

  const keyring = new Keyring({ type: "sr25519" });
  const deployer = keyring.addFromUri(config.deployerMnemonic);
  
  console.log("[Deploy] Deployer address:", deployer.address);

  const balance = await api.query.system.account(deployer.address);
  console.log("[Deploy] Deployer balance:", balance.data.free.toHuman());

  const contractPath = path.join(__dirname, "../counter/target/ink/counter.contract");
  
  if (!fs.existsSync(contractPath)) {
    throw new Error("Contract artifact not found. Please run 'yarn compile' first.");
  }

  const contractJson = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const metadata = JSON.stringify(contractJson);
  const wasm = contractJson.source.wasm;

  const code = new ContractPromise(api, metadata, "");

  console.log("[Deploy] Estimating gas...");
  const { gasRequired, storageDeposit } = await code.query.new(
    deployer.address,
    { gasLimit: -1 },
    config.initialValue
  );

  console.log("[Deploy] Gas required:", gasRequired.toHuman());
  console.log("[Deploy] Storage deposit:", storageDeposit.toHuman());

  const gasLimit = api.registry.createType("WeightV2", {
    refTime: gasRequired.refTime.toBn().muln(2),
    proofSize: gasRequired.proofSize.toBn().muln(2),
  });

  console.log("[Deploy] Deploying contract...");
  
  const unsub = await code.tx
    .new({ gasLimit, value: 0 }, config.initialValue)
    .signAndSend(deployer, ({ contract, status, events }) => {
      console.log("[Deploy] Transaction status:", status.type);

      if (status.isInBlock) {
        console.log("[Deploy] Included in block:", status.asInBlock.toHex());
      }

      if (status.isFinalized) {
        console.log("[Deploy] Finalized in block:", status.asFinalized.toHex());
        
        if (contract) {
          console.log("[Deploy] Contract deployed!");
          console.log("[Deploy] Contract address:", contract.address.toString());
          
          const deployment = {
            network: config.network,
            address: contract.address.toString(),
            codeHash: contract.abi.info.source.wasmHash.toHex(),
            deployedAt: new Date().toISOString(),
            blockHash: status.asFinalized.toHex(),
            initialValue: config.initialValue
          };

          const deploymentsPath = path.join(__dirname, "../deployments.json");
          let deployments: any = {};
          
          if (fs.existsSync(deploymentsPath)) {
            deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
          }
          
          if (!deployments[config.network]) {
            deployments[config.network] = {};
          }
          
          deployments[config.network].counter = deployment;
          
          fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
          console.log("[Deploy] Deployment info saved to deployments.json");
          
          unsub();
          process.exit(0);
        }
      }

      events.forEach(({ event }) => {
        if (api.events.system.ExtrinsicFailed.is(event)) {
          const [dispatchError] = event.data;
          console.error("[Deploy] Deployment failed:", dispatchError.toString());
          process.exit(1);
        }
      });
    });
}

async function main() {
  try {
    const config = await getDeploymentConfig();
    await deployContract(config);
  } catch (error) {
    console.error("[Deploy] Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);