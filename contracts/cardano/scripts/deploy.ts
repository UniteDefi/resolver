import { Lucid, Script, Data } from "lucid-cardano";
import {
  createBlockfrostProvider,
  createMaestroProvider,
  initializeLucid,
} from "../tests/utils/lucid-utils";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface DeploymentConfig {
  network: "preprod" | "mainnet";
  provider: "blockfrost" | "maestro";
}

const parseArgs = (): DeploymentConfig => {
  const args = process.argv.slice(2);
  const config: DeploymentConfig = {
    network: "preprod",
    provider: "blockfrost",
  };

  args.forEach((arg) => {
    const [key, value] = arg.split("=");
    switch (key) {
      case "--network":
        if (value === "mainnet" || value === "preprod") {
          config.network = value;
        }
        break;
      case "--provider":
        if (value === "blockfrost" || value === "maestro") {
          config.provider = value;
        }
        break;
    }
  });

  return config;
};

const loadValidatorScript = (): Script => {
  const plutusPath = path.join(__dirname, "../plutus.json");
  
  if (!fs.existsSync(plutusPath)) {
    console.error("[Deploy] Error: plutus.json not found. Run 'aiken build' first.");
    process.exit(1);
  }
  
  const plutusData = JSON.parse(fs.readFileSync(plutusPath, "utf8"));
  
  // Extract the counter validator
  const counterValidator = plutusData.validators.find(
    (v: any) => v.title === "counter.counter"
  );
  
  if (!counterValidator) {
    console.error("[Deploy] Error: Counter validator not found in plutus.json");
    process.exit(1);
  }
  
  return {
    type: "PlutusV2",
    script: counterValidator.compiledCode,
  };
};

const saveDeploymentInfo = (
  network: string,
  scriptAddress: string,
  scriptHash: string,
  txHash: string
) => {
  const deploymentInfo = {
    network,
    scriptAddress,
    scriptHash,
    deployedAt: new Date().toISOString(),
    deploymentTx: txHash,
  };
  
  const deploymentsPath = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsPath)) {
    fs.mkdirSync(deploymentsPath);
  }
  
  const filePath = path.join(deploymentsPath, `${network}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`[Deploy] Deployment info saved to ${filePath}`);
};

async function main() {
  const config = parseArgs();
  
  console.log(`[Deploy] Starting deployment to ${config.network} using ${config.provider}`);
  
  // Initialize provider
  let provider;
  if (config.provider === "blockfrost") {
    const projectId = config.network === "preprod"
      ? process.env.BLOCKFROST_PREPROD_PROJECT_ID
      : process.env.BLOCKFROST_MAINNET_PROJECT_ID;
    
    if (!projectId) {
      console.error(`[Deploy] Error: BLOCKFROST_${config.network.toUpperCase()}_PROJECT_ID not set`);
      process.exit(1);
    }
    
    provider = createBlockfrostProvider(projectId, config.network);
  } else {
    const apiKey = config.network === "preprod"
      ? process.env.MAESTRO_PREPROD_API_KEY
      : process.env.MAESTRO_MAINNET_API_KEY;
    
    if (!apiKey) {
      console.error(`[Deploy] Error: MAESTRO_${config.network.toUpperCase()}_API_KEY not set`);
      process.exit(1);
    }
    
    provider = createMaestroProvider(
      apiKey,
      config.network === "preprod" ? "Preprod" : "Mainnet"
    );
  }
  
  // Initialize Lucid
  const lucid = await initializeLucid(
    provider,
    config.network === "preprod" ? "Preprod" : "Mainnet"
  );
  
  // Load wallet
  const privateKey = config.network === "preprod"
    ? process.env.PREPROD_WALLET_PRIVATE_KEY
    : process.env.MAINNET_WALLET_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error(`[Deploy] Error: ${config.network.toUpperCase()}_WALLET_PRIVATE_KEY not set`);
    process.exit(1);
  }
  
  lucid.selectWalletFromPrivateKey(privateKey);
  const walletAddress = await lucid.wallet.address();
  
  console.log(`[Deploy] Wallet address: ${walletAddress}`);
  
  // Load validator script
  const script = loadValidatorScript();
  const scriptAddress = lucid.utils.validatorToAddress(script);
  const scriptHash = lucid.utils.validatorToScriptHash(script);
  
  console.log(`[Deploy] Script address: ${scriptAddress}`);
  console.log(`[Deploy] Script hash: ${scriptHash}`);
  
  // Create reference UTxO with the script
  try {
    const tx = await lucid
      .newTx()
      .payToAddressWithData(
        scriptAddress,
        {
          scriptRef: script,
        },
        { lovelace: 5000000n } // 5 ADA for reference UTxO
      )
      .complete();
    
    const signedTx = await tx.sign().complete();
    const txHash = await signedTx.submit();
    
    console.log(`[Deploy] Transaction submitted: ${txHash}`);
    console.log(`[Deploy] Waiting for confirmation...`);
    
    await lucid.awaitTx(txHash);
    
    console.log(`[Deploy] Transaction confirmed!`);
    
    // Save deployment info
    saveDeploymentInfo(config.network, scriptAddress, scriptHash, txHash);
    
    console.log(`[Deploy] Deployment complete!`);
    console.log(`[Deploy] Script deployed at: ${scriptAddress}`);
  } catch (error) {
    console.error(`[Deploy] Error during deployment:`, error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[Deploy] Unhandled error:`, error);
  process.exit(1);
});