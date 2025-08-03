import { Client, Wallet, dropsToXrp } from "xrpl";
import { XRPLHTLCFactory } from "../src/htlc/XRPLHTLCFactory";
import { XRPLOrderProtocol } from "../src/htlc/XRPLOrderProtocol";
import { XRPLUniteResolver } from "../src/resolver/XRPLUniteResolver";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("=== DEPLOYING ALL XRPL CONTRACTS ===");

  const NETWORK = process.env.XRPL_NETWORK || "testnet";
  const SERVER_URL = process.env.XRPL_SERVER_URL || "wss://s.altnet.rippletest.net:51233";
  
  const DEPLOYER_SECRET = process.env.XRPL_DEPLOYER_SECRET;
  const USER_SECRET = process.env.XRPL_USER_SECRET;
  const RESOLVER_SECRET_0 = process.env.XRPL_RESOLVER_SECRET_0;
  const RESOLVER_SECRET_1 = process.env.XRPL_RESOLVER_SECRET_1;
  const RESOLVER_SECRET_2 = process.env.XRPL_RESOLVER_SECRET_2;
  const RESOLVER_SECRET_3 = process.env.XRPL_RESOLVER_SECRET_3;

  if (!DEPLOYER_SECRET) {
    console.error("❌ Missing XRPL_DEPLOYER_SECRET");
    process.exit(1);
  }

  const client = new Client(SERVER_URL);
  
  try {
    await client.connect();
    console.log(`Chain: XRPL ${NETWORK}`);
    console.log(`Server: ${SERVER_URL}`);

    // Initialize wallets
    const deployerWallet = Wallet.fromSeed(DEPLOYER_SECRET);
    const userWallet = USER_SECRET ? Wallet.fromSeed(USER_SECRET) : Wallet.generate();
    const resolver0 = RESOLVER_SECRET_0 ? Wallet.fromSeed(RESOLVER_SECRET_0) : Wallet.generate();
    const resolver1 = RESOLVER_SECRET_1 ? Wallet.fromSeed(RESOLVER_SECRET_1) : Wallet.generate();
    const resolver2 = RESOLVER_SECRET_2 ? Wallet.fromSeed(RESOLVER_SECRET_2) : Wallet.generate();
    const resolver3 = RESOLVER_SECRET_3 ? Wallet.fromSeed(RESOLVER_SECRET_3) : Wallet.generate();

    console.log("Deployer:", deployerWallet.address);
    console.log("User:", userWallet.address);
    console.log("Resolver0:", resolver0.address);
    console.log("Resolver1:", resolver1.address);
    console.log("Resolver2:", resolver2.address);
    console.log("Resolver3:", resolver3.address);

    // Check deployer balance
    const deployerBalance = await client.getXrpBalance(deployerWallet.address);
    console.log(`Deployer balance: ${deployerBalance} XRP`);
    
    if (parseFloat(deployerBalance) < 2) {
      console.error("❌ Insufficient deployer balance. Need at least 2 XRP for minimal deployment");
      process.exit(1);
    }
    
    console.log("⚠️ Conservative mode: Deploying with limited funds, will not fund all wallets initially");

    // 1. Deploy XRPLHTLCFactory
    console.log("\n--- Deploying Core Contracts ---");
    console.log("1. XRPLHTLCFactory");
    const factory = new XRPLHTLCFactory(SERVER_URL);
    await factory.connect();

    // 2. Deploy XRPLOrderProtocol
    console.log("2. XRPLOrderProtocol");
    const orderProtocol = new XRPLOrderProtocol();

    // 3. Deploy Resolver Contracts
    console.log("3. UniteResolver0");
    const resolver0Contract = new XRPLUniteResolver(
      factory,
      orderProtocol,
      resolver0.address,
      resolver0.seed!,
      client
    );

    console.log("4. UniteResolver1");
    const resolver1Contract = new XRPLUniteResolver(
      factory,
      orderProtocol,
      resolver1.address,
      resolver1.seed!,
      client
    );

    console.log("5. UniteResolver2");
    const resolver2Contract = new XRPLUniteResolver(
      factory,
      orderProtocol,
      resolver2.address,
      resolver2.seed!,
      client
    );

    console.log("6. UniteResolver3");
    const resolver3Contract = new XRPLUniteResolver(
      factory,
      orderProtocol,
      resolver3.address,
      resolver3.seed!,
      client
    );

    // Prepare deployment data
    const deploymentData = {
      network: NETWORK,
      name: `XRPL ${NETWORK.charAt(0).toUpperCase() + NETWORK.slice(1)}`,
      deployedAt: new Date().toISOString(),
      serverUrl: SERVER_URL,
      // Contract instances (classes, not addresses for XRPL)
      XRPLHTLCFactory: "initialized",
      XRPLOrderProtocol: "initialized", 
      UniteResolver0: resolver0.address,
      UniteResolver1: resolver1.address,
      UniteResolver2: resolver2.address,
      UniteResolver3: resolver3.address,
      // Wallets
      deployer: deployerWallet.address,
      user: userWallet.address,
      resolver0: resolver0.address,
      resolver1: resolver1.address,
      resolver2: resolver2.address,
      resolver3: resolver3.address,
    };

    console.log("\n=== DEPLOYED ADDRESSES ===");
    console.log("XRPLHTLCFactory: initialized");
    console.log("XRPLOrderProtocol: initialized");
    console.log("UniteResolver0:", resolver0.address);
    console.log("UniteResolver1:", resolver1.address);
    console.log("UniteResolver2:", resolver2.address);
    console.log("UniteResolver3:", resolver3.address);

    // Save deployment info
    const deploymentPath = path.join(__dirname, "../deployments.json");
    let deployments: any = {};
    
    if (fs.existsSync(deploymentPath)) {
      deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    }
    
    if (!deployments.xrpl) {
      deployments.xrpl = {};
    }
    deployments.xrpl[NETWORK] = deploymentData;
    
    fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));

    console.log("\n=== COPY TO DEPLOYMENTS.JSON ===");
    console.log(`"xrpl": {`);
    console.log(`  "${NETWORK}": {`);
    console.log(`    "network": "${NETWORK}",`);
    console.log(`    "name": "XRPL ${NETWORK.charAt(0).toUpperCase() + NETWORK.slice(1)}",`);
    console.log(`    "serverUrl": "${SERVER_URL}",`);
    console.log(`    "XRPLHTLCFactory": "initialized",`);
    console.log(`    "XRPLOrderProtocol": "initialized",`);
    console.log(`    "UniteResolver0": "${resolver0.address}",`);
    console.log(`    "UniteResolver1": "${resolver1.address}",`);
    console.log(`    "UniteResolver2": "${resolver2.address}",`);
    console.log(`    "UniteResolver3": "${resolver3.address}",`);
    console.log(`    "deployer": "${deployerWallet.address}",`);
    console.log(`    "user": "${userWallet.address}"`);
    console.log(`  }`);
    console.log(`}`);

    // Print wallet secrets if generated
    if (!USER_SECRET || !RESOLVER_SECRET_0 || !RESOLVER_SECRET_1 || !RESOLVER_SECRET_2 || !RESOLVER_SECRET_3) {
      console.log("\n=== WALLET SECRETS (SAVE TO .env) ===");
      if (!USER_SECRET) console.log(`XRPL_USER_SECRET=${userWallet.seed}`);
      if (!RESOLVER_SECRET_0) console.log(`XRPL_RESOLVER_SECRET_0=${resolver0.seed}`);
      if (!RESOLVER_SECRET_1) console.log(`XRPL_RESOLVER_SECRET_1=${resolver1.seed}`);
      if (!RESOLVER_SECRET_2) console.log(`XRPL_RESOLVER_SECRET_2=${resolver2.seed}`);
      if (!RESOLVER_SECRET_3) console.log(`XRPL_RESOLVER_SECRET_3=${resolver3.seed}`);
    }

    console.log("\n✅ DEPLOYMENT COMPLETE");

  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});