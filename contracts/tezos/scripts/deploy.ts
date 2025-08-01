import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface DeploymentConfig {
  network: string;
  rpcUrl: string;
  secretKey: string;
  initialValue: number;
}

async function deploy() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const networkFlag = args.indexOf("--network");
  const network = networkFlag !== -1 ? args[networkFlag + 1] : "local";

  console.log(`[Deploy] Deploying to ${network} network...`);

  // Load configuration based on network
  const config: DeploymentConfig = {
    network,
    rpcUrl: process.env[`TEZOS_${network.toUpperCase()}_RPC_URL`] || "http://localhost:20000",
    secretKey: process.env[`TEZOS_${network.toUpperCase()}_SECRET_KEY`] || "",
    initialValue: parseInt(process.env.COUNTER_INITIAL_VALUE || "0"),
  };

  if (!config.secretKey) {
    throw new Error(`Missing secret key for ${network} network. Please set TEZOS_${network.toUpperCase()}_SECRET_KEY in .env`);
  }

  // Initialize Tezos toolkit
  const tezos = new TezosToolkit(config.rpcUrl);
  tezos.setProvider({
    signer: new InMemorySigner(config.secretKey),
  });

  try {
    // Read compiled contract
    const contractPath = path.join(__dirname, "../output/counter/proper_counter.json");
    
    if (!fs.existsSync(contractPath)) {
      throw new Error("Contract not compiled. Please run 'npm run compile' first.");
    }

    const contractCode = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    console.log("[Deploy] Deploying contract with initial value:", config.initialValue);

    // Deploy contract
    const origination = await tezos.contract.originate({
      code: contractCode,
      storage: config.initialValue, // Storage is just a nat, not an object
    });

    console.log("[Deploy] Waiting for confirmation...");
    await origination.confirmation();

    const contractAddress = origination.contractAddress!;
    console.log("[Deploy] Contract deployed successfully!");
    console.log("[Deploy] Contract address:", contractAddress);
    console.log("[Deploy] Operation hash:", origination.hash);

    // Save deployment information
    const deploymentInfo = {
      network,
      contractAddress,
      deploymentHash: origination.hash,
      deployedAt: new Date().toISOString(),
      initialValue: config.initialValue,
    };

    const deploymentsPath = path.join(__dirname, "../deployments.json");
    let deployments: any = {};
    
    if (fs.existsSync(deploymentsPath)) {
      deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    }

    deployments[network] = deploymentInfo;
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));

    console.log("[Deploy] Deployment info saved to deployments.json");

  } catch (error) {
    console.error("[Deploy] Deployment failed:", error);
    process.exit(1);
  }
}

// Run deployment
deploy().catch((error) => {
  console.error("[Deploy] Unexpected error:", error);
  process.exit(1);
});