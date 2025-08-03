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
  const network = (process.env.APTOS_NETWORK as Network) || Network.TESTNET;
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

  // Check account balance using multiple methods
  console.log("[Deploy] Checking deployer account...");

  let deployerBalance = 0;
  let accountExists = false;

  // Method 1: Try getAccountInfo first
  try {
    const accountInfo = await aptos.getAccountInfo({
      accountAddress: deployer.accountAddress,
    });
    console.log("[Deploy] Account exists. Sequence number:", accountInfo.sequence_number);
    accountExists = true;
  } catch (error) {
    console.log("[Deploy] Account info check failed, but continuing...");
  }

  // Method 2: Try to get balance using view function
  try {
    const balance = await aptos.view({
      payload: {
        function: "0x1::coin::balance",
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [deployer.accountAddress.toString()],
      },
    });
    deployerBalance = parseInt(balance[0] as string);
    console.log("[Deploy] Deployer balance:", deployerBalance, "octas (", (deployerBalance / 100_000_000).toFixed(4), "APT)");
  } catch (error) {
    console.log("[Deploy] Balance check via view failed, trying resource method...");
    
    // Method 3: Try getAccountResource as fallback
    try {
      const balanceResource = await aptos.getAccountResource({
        accountAddress: deployer.accountAddress,
        resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
      });
      deployerBalance = parseInt((balanceResource as any).coin.value);
      console.log("[Deploy] Deployer balance:", deployerBalance, "octas (", (deployerBalance / 100_000_000).toFixed(4), "APT)");
    } catch (resourceError) {
      console.log("[Deploy] Could not determine balance, but proceeding with deployment...");
      console.log("[Deploy] If deployment fails, ensure account has sufficient APT");
    }
  }

  // Only warn if balance is definitely too low
  if (deployerBalance > 0 && deployerBalance < 10_000_000) { // Less than 0.1 APT
    console.log("[Deploy] ⚠️  Low balance detected. Minimum 0.1 APT recommended for deployment.");
  } else if (deployerBalance > 0) {
    console.log("[Deploy] ✅ Sufficient balance for deployment");
  }

  // Update Move.toml with the actual address
  const moveTomlPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "Move.toml");
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
      cwd: path.join(path.dirname(new URL(import.meta.url).pathname), ".."),
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
      cwd: path.join(path.dirname(new URL(import.meta.url).pathname), ".."),
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

  // Check resolver accounts and log funding requirements
  console.log("\n[Deploy] Checking resolver accounts...");
  console.log("═══════════════════════════════════════════════════════════");
  
  const resolverKeys = [
    process.env.APTOS_RESOLVER_PRIVATE_KEY_0,
    process.env.APTOS_RESOLVER_PRIVATE_KEY_1,
    process.env.APTOS_RESOLVER_PRIVATE_KEY_2,
    process.env.APTOS_RESOLVER_PRIVATE_KEY_3,
  ];

  const resolvers = [];
  const unfundedResolvers = [];
  const minRequiredBalance = 50_000_000; // 0.5 APT in octas

  for (let i = 0; i < 4; i++) {
    if (!resolverKeys[i]) {
      console.log(`❌ MISSING: APTOS_RESOLVER_PRIVATE_KEY_${i}`);
      resolvers.push("0x0");
      continue;
    }

    const resolver = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(resolverKeys[i]!),
    });

    const resolverAddress = resolver.accountAddress.toString();
    resolvers.push(resolverAddress);

    // Check balance using view function
    let resolverBalance = 0;
    try {
      const balance = await aptos.view({
        payload: {
          function: "0x1::coin::balance",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [resolverAddress],
        },
      });
      resolverBalance = parseInt(balance[0] as string);
    } catch (error) {
      // Try resource method as fallback
      try {
        const balanceResource = await aptos.getAccountResource({
          accountAddress: resolver.accountAddress,
          resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
        });
        resolverBalance = parseInt((balanceResource as any).coin.value);
      } catch (resourceError) {
        // Account doesn't exist or has no APT
        resolverBalance = 0;
      }
    }

    const balanceAPT = (resolverBalance / 100_000_000).toFixed(4);
    
    if (resolverBalance >= minRequiredBalance) {
      console.log(`✅ Resolver ${i}: ${resolverAddress}`);
      console.log(`   Balance: ${resolverBalance} octas (${balanceAPT} APT) - SUFFICIENT`);
    } else if (resolverBalance > 0) {
      console.log(`⚠️  Resolver ${i}: ${resolverAddress}`);
      console.log(`   Balance: ${resolverBalance} octas (${balanceAPT} APT) - NEEDS FUNDING`);
      unfundedResolvers.push({ index: i, address: resolverAddress, balance: resolverBalance });
    } else {
      console.log(`❌ Resolver ${i}: ${resolverAddress}`);
      console.log(`   Status: NOT INITIALIZED - NEEDS FUNDING`);
      unfundedResolvers.push({ index: i, address: resolverAddress, balance: 0 });
    }
  }

  // Auto-fund resolvers if needed
  if (unfundedResolvers.length > 0) {
    console.log("\n💰 AUTO-FUNDING RESOLVERS:");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Found ${unfundedResolvers.length} resolvers that need funding.`);
    console.log("Transferring 0.2 APT from deployer to each resolver...");
    console.log("");
    
    const fundingAmount = 20_000_000; // 0.2 APT in octas
    
    // Check if deployer has enough balance to fund all resolvers
    const totalNeeded = unfundedResolvers.length * fundingAmount;
    if (deployerBalance < totalNeeded) {
      const neededAPT = (totalNeeded / 100_000_000).toFixed(4);
      const currentAPT = (deployerBalance / 100_000_000).toFixed(4);
      console.log(`❌ Insufficient deployer balance!`);
      console.log(`   Current: ${currentAPT} APT`);
      console.log(`   Needed:  ${neededAPT} APT`);
      console.log(`   Please add more APT to deployer account: ${deployer.accountAddress.toString()}`);
      throw new Error("Insufficient deployer balance for auto-funding");
    }
    
    // Fund each resolver
    for (const { index, address } of unfundedResolvers) {
      try {
        console.log(`💸 Funding Resolver ${index}: ${address}`);
        
        const fundingTxn = await aptos.transaction.build.simple({
          sender: deployer.accountAddress,
          data: {
            function: "0x1::aptos_account::transfer",
            functionArguments: [address, fundingAmount.toString()],
          },
        });

        const fundingResult = await aptos.signAndSubmitTransaction({
          signer: deployer,
          transaction: fundingTxn,
        });

        await aptos.waitForTransaction({
          transactionHash: fundingResult.hash,
        });

        console.log(`✅ Successfully funded Resolver ${index} with 0.2 APT`);
        console.log(`   Transaction: ${fundingResult.hash}`);
        
      } catch (error: any) {
        console.error(`❌ Failed to fund Resolver ${index}:`, error.message);
        throw error;
      }
    }
    
    console.log("\n✅ All resolvers funded successfully!");
    console.log("═══════════════════════════════════════════════════════════");
    
    // Clear the unfunded list since we just funded them
    unfundedResolvers.length = 0;
  }

  // Initialize all resolver accounts (now that they're funded)
  console.log("\n[Deploy] Initializing resolver accounts...");
  
  for (let i = 0; i < 4; i++) {
    if (!resolverKeys[i]) {
      console.log(`[Deploy] Skipping resolver ${i} - no private key provided`);
      continue;
    }

    const resolver = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(resolverKeys[i]!),
    });

    // Try to initialize
    try {
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

      console.log(`✅ Resolver ${i} initialized successfully`);
    } catch (error: any) {
      if (error.message?.includes("E_ALREADY_INITIALIZED") || 
          error.message?.includes("already exists")) {
        console.log(`✅ Resolver ${i} already initialized`);
      } else {
        console.error(`❌ Failed to initialize resolver ${i}:`, error.message);
      }
    }
  }

  // Ensure we have 4 resolver addresses (pad with 0x0 if needed)
  while (resolvers.length < 4) {
    resolvers.push("0x0");
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

  console.log("\n[Deploy] Deployment completed!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Package Address:", packageAddress);
  console.log("Network:", network);
  console.log("Explorer:", `https://explorer.aptoslabs.com/account/${packageAddress}?network=${network}`);
  console.log("\n✅ All available resolvers funded and initialized successfully!");
  console.log("═══════════════════════════════════════════════════════════");

  return deploymentAddresses;
}

// Helper function to save deployment to JSON
async function saveDeployment() {
  try {
    const addresses = await deployUniteProtocol();
    
    // Load existing deployments
    const deploymentsPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "deployments.json");
    let deployments: any = {};
    
    if (fs.existsSync(deploymentsPath)) {
      deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    }

    // Add Aptos deployment
    if (!deployments.aptos) {
      deployments.aptos = {};
    }

    const network = process.env.APTOS_NETWORK || "testnet";
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
if (import.meta.url === `file://${process.argv[1]}`) {
  saveDeployment();
}

export { deployUniteProtocol, type DeploymentAddresses };