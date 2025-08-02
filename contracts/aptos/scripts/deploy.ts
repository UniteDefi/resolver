import { AptosClient, AptosAccount, FaucetClient, TxnBuilderTypes, BCS } from "aptos";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com";
const FAUCET_URL = process.env.APTOS_FAUCET_URL || "https://faucet.testnet.aptoslabs.com";

interface DeploymentInfo {
  network: string;
  deployer: string;
  modules: {
    escrow: string;
    escrowFactory: string;
    limitOrderProtocol: string;
    resolver: string;
    testCoinUSDT: string;
    testCoinDAI: string;
  };
  timestamp: string;
}

async function deployContracts() {
  console.log("[Deploy] Starting deployment process...");

  // Initialize clients
  const client = new AptosClient(NODE_URL);
  const faucetClient = new FaucetClient(NODE_URL, FAUCET_URL);

  // Create or load deployer account
  let account: AptosAccount;
  const privateKeyHex = process.env.APTOS_PRIVATE_KEY;
  
  if (privateKeyHex) {
    const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, "hex"));
    account = new AptosAccount(privateKey);
    console.log("[Deploy] Using existing account:", account.address().hex());
  } else {
    account = new AptosAccount();
    console.log("[Deploy] Created new account:", account.address().hex());
    console.log("[Deploy] Private key:", Buffer.from(account.signingKey.secretKey).toString("hex"));
    
    // Fund the account
    console.log("[Deploy] Funding account...");
    await faucetClient.fundAccount(account.address(), 100_000_000);
  }

  // Check balance
  const resources = await client.getAccountResources(account.address());
  const accountResource = resources.find((r) => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>");
  console.log("[Deploy] Account balance:", accountResource?.data.coin.value);

  // Compile the package
  console.log("[Deploy] Compiling Move package...");
  const packagePath = path.join(__dirname, "..");
  const compiledModules = await compilePackage(packagePath);

  // Deploy modules
  console.log("[Deploy] Deploying modules...");
  const txnHash = await publishPackage(client, account, compiledModules, []);
  
  console.log("[Deploy] Transaction hash:", txnHash);
  console.log("[Deploy] Waiting for transaction...");
  
  await client.waitForTransaction(txnHash);
  console.log("[Deploy] Modules deployed successfully!");

  // Initialize modules
  console.log("[Deploy] Initializing modules...");
  await initializeModules(client, account);

  // Save deployment info
  const deploymentInfo: DeploymentInfo = {
    network: NODE_URL,
    deployer: account.address().hex(),
    modules: {
      escrow: `${account.address().hex()}::escrow`,
      escrowFactory: `${account.address().hex()}::escrow_factory`,
      limitOrderProtocol: `${account.address().hex()}::limit_order_protocol`,
      resolver: `${account.address().hex()}::resolver`,
      testCoinUSDT: `${account.address().hex()}::test_coin::USDT`,
      testCoinDAI: `${account.address().hex()}::test_coin::DAI`,
    },
    timestamp: new Date().toISOString(),
  };

  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("[Deploy] Deployment info saved to:", deploymentPath);

  return deploymentInfo;
}

async function compilePackage(packagePath: string): Promise<string> {
  const { execSync } = require("child_process");
  
  try {
    execSync(`aptos move compile --package-dir ${packagePath} --save-metadata`, {
      stdio: "inherit",
    });
    
    // Read compiled bytecode
    const buildPath = path.join(packagePath, "build", "unite-aptos", "bytecode_modules");
    const modules = fs.readdirSync(buildPath)
      .filter(f => f.endsWith(".mv"))
      .map(f => fs.readFileSync(path.join(buildPath, f)))
      .map(b => Buffer.from(b).toString("hex"));
    
    return modules.join("");
  } catch (error) {
    console.error("[Deploy] Compilation failed:", error);
    throw error;
  }
}

async function publishPackage(
  client: AptosClient,
  account: AptosAccount,
  moduleHex: string,
  extraArgs: any[]
): Promise<string> {
  const payload = {
    type: "module_bundle_payload",
    modules: [{ bytecode: `0x${moduleHex}` }],
  };

  const txnRequest = await client.generateTransaction(account.address(), payload);
  const signedTxn = await client.signTransaction(account, txnRequest);
  const res = await client.submitTransaction(signedTxn);
  
  return res.hash;
}

async function initializeModules(client: AptosClient, account: AptosAccount) {
  // Initialize escrow events
  await executeTransaction(client, account, {
    function: `${account.address().hex()}::escrow::initialize`,
    type_arguments: [],
    arguments: [],
  });

  // Initialize factory
  await executeTransaction(client, account, {
    function: `${account.address().hex()}::escrow_factory::initialize`,
    type_arguments: [],
    arguments: [],
  });

  // Initialize order protocol
  await executeTransaction(client, account, {
    function: `${account.address().hex()}::limit_order_protocol::initialize`,
    type_arguments: [],
    arguments: [],
  });

  // Initialize resolver registry
  await executeTransaction(client, account, {
    function: `${account.address().hex()}::resolver::initialize`,
    type_arguments: [],
    arguments: [],
  });

  // Initialize test coins
  await executeTransaction(client, account, {
    function: `${account.address().hex()}::test_coin::initialize_usdt`,
    type_arguments: [],
    arguments: [],
  });

  await executeTransaction(client, account, {
    function: `${account.address().hex()}::test_coin::initialize_dai`,
    type_arguments: [],
    arguments: [],
  });

  console.log("[Deploy] All modules initialized!");
}

async function executeTransaction(
  client: AptosClient,
  account: AptosAccount,
  payload: any
): Promise<void> {
  const txnRequest = await client.generateTransaction(account.address(), payload);
  const signedTxn = await client.signTransaction(account, txnRequest);
  const res = await client.submitTransaction(signedTxn);
  await client.waitForTransaction(res.hash);
}

// Run deployment
deployContracts()
  .then((info) => {
    console.log("[Deploy] Deployment completed!");
    console.log(JSON.stringify(info, null, 2));
  })
  .catch((error) => {
    console.error("[Deploy] Deployment failed:", error);
    process.exit(1);
  });