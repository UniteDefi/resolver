import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
  MoveString,
  MoveVector,
  U64,
  U8,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

interface DeploymentAddresses {
  packageAddress: string;
  limitOrderProtocol: string;
  escrowFactory: string;
  resolver0: string;
  resolver1: string;
  resolver2: string;
  resolver3: string;
  testUSDT: string;
  testDAI: string;
}

async function deployUniteProtocol(): Promise<DeploymentAddresses> {
  console.log("[Deploy] Starting Aptos Unite Protocol deployment...");

  // Configuration
  const network = (process.env.APTOS_NETWORK as Network) || Network.DEVNET;
  const config = new AptosConfig({ network });
  const aptos = new Aptos(config);

  // Account setup
  let deployer: Account;
  const privateKey = process.env.APTOS_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error("APTOS_PRIVATE_KEY not found in environment variables");
  }

  deployer = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });

  console.log("[Deploy] Deployer address:", deployer.accountAddress.toString());

  // Check account balance
  try {
    const balance = await aptos.getAccountResource({
      accountAddress: deployer.accountAddress,
      resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
    });
    console.log("[Deploy] Account balance:", (balance as any).coin.value);
  } catch (error) {
    console.log("[Deploy] Account might not be initialized yet, funding...");
    try {
      await aptos.fundAccount({
        accountAddress: deployer.accountAddress,
        amount: 100_000_000, // 1 APT
      });
      console.log("[Deploy] Account funded with 1 APT");
    } catch (fundError) {
      console.log("[Deploy] Could not fund account, proceeding anyway...");
    }
  }

  // Update Move.toml with the actual address
  const moveTomlPath = path.join(__dirname, "..", "Move.toml");
  let moveTomlContent = fs.readFileSync(moveTomlPath, "utf8");
  moveTomlContent = moveTomlContent.replace(
    'aptos_addr = "_"',
    `aptos_addr = "${deployer.accountAddress.toString()}"`
  );
  fs.writeFileSync(moveTomlPath, moveTomlContent);
  console.log("[Deploy] Updated Move.toml with deployer address");

  // Compile the module
  console.log("[Deploy] Compiling Move modules...");
  try {
    execSync("aptos move compile", {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });
    console.log("[Deploy] Compilation successful");
  } catch (error) {
    console.error("[Deploy] Compilation failed:", error);
    throw error;
  }

  // Publish the package
  console.log("[Deploy] Publishing package...");
  try {
    const restUrl = network === Network.DEVNET ? 'https://fullnode.devnet.aptoslabs.com' : 
                   network === Network.TESTNET ? 'https://fullnode.testnet.aptoslabs.com' :
                   'https://fullnode.mainnet.aptoslabs.com';
    
    // Use CLI for publishing
    const publishCommand = `aptos move publish \
      --private-key "${privateKey}" \
      --url "${restUrl}" \
      --assume-yes \
      --skip-fetch-latest-git-deps`;
      
    execSync(publishCommand, {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });

    console.log("[Deploy] Package published successfully!");
    console.log("[Deploy] Package address:", deployer.accountAddress.toString());
  } catch (error) {
    console.error("[Deploy] Package publication failed:", error);
    throw error;
  }

  const packageAddress = deployer.accountAddress.toString();

  // Initialize test coins
  console.log("[Deploy] Initializing test coins...");
  
  // Initialize USDT
  try {
    const initUSDTTxn = await aptos.transaction.build.simple({
      sender: deployer.accountAddress,
      data: {
        function: `${packageAddress}::test_coin::initialize_usdt`,
        functionArguments: [],
      },
    });

    const usdtResult = await aptos.signAndSubmitTransaction({
      signer: deployer,
      transaction: initUSDTTxn,
    });

    await aptos.waitForTransaction({
      transactionHash: usdtResult.hash,
    });

    console.log("[Deploy] Test USDT initialized");
  } catch (error: any) {
    if (error.message?.includes("ECOIN_INFO_ALREADY_PUBLISHED")) {
      console.log("[Deploy] Test USDT already initialized, skipping...");
    } else {
      throw error;
    }
  }

  // Initialize DAI
  try {
    const initDAITxn = await aptos.transaction.build.simple({
      sender: deployer.accountAddress,
      data: {
        function: `${packageAddress}::test_coin::initialize_dai`,
        functionArguments: [],
      },
    });

    const daiResult = await aptos.signAndSubmitTransaction({
      signer: deployer,
      transaction: initDAITxn,
    });

    await aptos.waitForTransaction({
      transactionHash: daiResult.hash,
    });

    console.log("[Deploy] Test DAI initialized");
  } catch (error: any) {
    if (error.message?.includes("ECOIN_INFO_ALREADY_PUBLISHED")) {
      console.log("[Deploy] Test DAI already initialized, skipping...");
    } else {
      throw error;
    }
  }

  // Initialize Limit Order Protocol
  console.log("[Deploy] Initializing Limit Order Protocol...");
  
  try {
    const initLOPTxn = await aptos.transaction.build.simple({
      sender: deployer.accountAddress,
      data: {
        function: `${packageAddress}::limit_order_protocol::initialize`,
        functionArguments: [],
      },
    });

    const lopResult = await aptos.signAndSubmitTransaction({
      signer: deployer,
      transaction: initLOPTxn,
    });

    await aptos.waitForTransaction({
      transactionHash: lopResult.hash,
    });

    console.log("[Deploy] Limit Order Protocol initialized");
  } catch (error: any) {
    if (error.message?.includes("E_ALREADY_INITIALIZED") || 
        error.message?.includes("already exists") ||
        error.message?.includes("Execution failed") ||
        error.message?.includes("code offset 12")) {
      console.log("[Deploy] Limit Order Protocol already initialized, skipping...");
    } else {
      throw error;
    }
  }

  // Initialize Escrow Factory
  console.log("[Deploy] Initializing Escrow Factory...");
  
  try {
    const initFactoryTxn = await aptos.transaction.build.simple({
      sender: deployer.accountAddress,
      data: {
        function: `${packageAddress}::escrow_factory::initialize`,
        functionArguments: [],
      },
    });

    const factoryResult = await aptos.signAndSubmitTransaction({
      signer: deployer,
      transaction: initFactoryTxn,
    });

    await aptos.waitForTransaction({
      transactionHash: factoryResult.hash,
    });

    console.log("[Deploy] Escrow Factory initialized");
  } catch (error: any) {
    if (error.message?.includes("E_ALREADY_INITIALIZED") || 
        error.message?.includes("already exists") ||
        error.message?.includes("ERESOURCE_ACCCOUNT_EXISTS") ||
        error.message?.includes("resource account on a claimed account")) {
      console.log("[Deploy] Escrow Factory already initialized, skipping...");
    } else {
      throw error;
    }
  }

  // Create resolver accounts
  console.log("[Deploy] Creating resolver accounts...");
  
  const resolvers = [];
  for (let i = 0; i < 4; i++) {
    const resolver = Account.generate();
    
    // Fund resolver account
    try {
      await aptos.fundAccount({
        accountAddress: resolver.accountAddress,
        amount: 50_000_000, // 0.5 APT
      });
    } catch (error) {
      console.log(`[Deploy] Could not fund resolver ${i}, creating anyway...`);
    }

    // Initialize resolver
    const initResolverTxn = await aptos.transaction.build.simple({
      sender: resolver.accountAddress,
      data: {
        function: `${packageAddress}::resolver::initialize`,
        functionArguments: [
          packageAddress, // factory_addr
          packageAddress, // protocol_addr
        ],
      },
    });

    const resolverResult = await aptos.signAndSubmitTransaction({
      signer: resolver,
      transaction: initResolverTxn,
    });

    await aptos.waitForTransaction({
      transactionHash: resolverResult.hash,
    });

    resolvers.push(resolver.accountAddress.toString());
    console.log(`[Deploy] Resolver ${i} initialized at:`, resolver.accountAddress.toString());
    console.log(`[Deploy] Resolver ${i} private key:`, resolver.privateKey.toString());
  }

  const deploymentAddresses: DeploymentAddresses = {
    packageAddress,
    limitOrderProtocol: packageAddress,
    escrowFactory: packageAddress,
    resolver0: resolvers[0],
    resolver1: resolvers[1],
    resolver2: resolvers[2],
    resolver3: resolvers[3],
    testUSDT: `${packageAddress}::test_coin::TestUSDT`,
    testDAI: `${packageAddress}::test_coin::TestDAI`,
  };

  console.log("[Deploy] Deployment completed successfully!");
  console.log("[Deploy] Addresses:", deploymentAddresses);
  console.log("[Deploy] Explorer:", `https://explorer.aptoslabs.com/account/${packageAddress}?network=${network}`);

  return deploymentAddresses;
}

// Helper function to save deployment to JSON
async function saveDeployment() {
  try {
    const addresses = await deployUniteProtocol();
    
    // Load existing deployments
    const deploymentsPath = path.join(__dirname, "..", "deployments.json");
    let deployments: any = {};
    
    if (fs.existsSync(deploymentsPath)) {
      deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    }

    // Add Aptos deployment
    if (!deployments.aptos) {
      deployments.aptos = {};
    }

    const network = process.env.APTOS_NETWORK || "devnet";
    deployments.aptos[network] = {
      network: network,
      chainId: network === "mainnet" ? 1 : network === "testnet" ? 2 : 3,
      ...addresses,
    };

    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("[Deploy] Deployment saved to deployments.json");
    
  } catch (error) {
    console.error("[Deploy] Deployment failed:", error);
    process.exit(1);
  }
}

// Run deployment if called directly
if (require.main === module) {
  saveDeployment();
}

export { deployUniteProtocol, type DeploymentAddresses };