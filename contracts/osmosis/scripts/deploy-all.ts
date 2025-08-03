import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

async function deployAll() {
  console.log("=== DEPLOYING ALL OSMOSIS CONTRACTS ===");

  // Setup deployer wallet
  const deployerMnemonic = process.env.OSMO_TESTNET_MNEMONIC;
  if (!deployerMnemonic) {
    throw new Error("OSMO_TESTNET_MNEMONIC environment variable not set");
  }

  const deployerWallet = await DirectSecp256k1HdWallet.fromMnemonic(deployerMnemonic, { prefix: "osmo" });
  const [deployerAccount] = await deployerWallet.getAccounts();
  
  console.log("Chain: Osmosis Testnet");
  console.log("Deployer:", deployerAccount.address);

  const rpcEndpoints = [
    process.env.OSMO_TESTNET_RPC || "https://rpc.osmo-test.ccvalidators.com",
    "https://osmosis-testnet-rpc.polkachu.com",
    "https://rpc.testnet.osmosis.zone"
  ];
  
  const gasPrice = GasPrice.fromString("0.025uosmo");
  let client: SigningCosmWasmClient | undefined;
  let lastError: Error | undefined;
  
  for (const rpc of rpcEndpoints) {
    try {
      console.log(`Trying RPC: ${rpc}`);
      client = await SigningCosmWasmClient.connectWithSigner(rpc, deployerWallet, { gasPrice });
      console.log("✅ Connected successfully");
      break;
    } catch (error) {
      const err = error as Error;
      console.log(`❌ Failed to connect to ${rpc}:`, err.message);
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between attempts
    }
  }
  
  if (!client) {
    throw new Error(`Failed to connect to any RPC endpoint. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  // Check deployer balance
  const balance = await client.getBalance(deployerAccount.address, "uosmo");
  console.log(`Deployer balance: ${(parseInt(balance.amount) / 1_000_000).toFixed(2)} OSMO`);
  
  if (parseInt(balance.amount) < 2_000_000) { // 2 OSMO minimum (adjusted for available funds)
    console.error("❌ Insufficient balance. Need at least 2 OSMO for deployment");
    process.exit(1);
  }

  try {
    // 1. Deploy Test Tokens (MockUSDT and MockDAI)
    console.log("\n📄 1. Deploying Test Tokens...");
    const testTokenWasm = fs.readFileSync("target/wasm32-unknown-unknown/release/test_token.wasm");
    const testTokenUpload = await client.upload(deployerAccount.address, testTokenWasm, "auto");
    
    // Deploy MockUSDT (6 decimals)
    const mockUSDTInit = {
      token_type: "MockUSDT"
    };

    const mockUSDTResult = await client.instantiate(
      deployerAccount.address,
      testTokenUpload.codeId, 
      mockUSDTInit,
      "Mock USDT",
      "auto"
    );
    console.log(`✅ Mock USDT: ${mockUSDTResult.contractAddress}`);

    // Deploy MockDAI (6 decimals)
    const mockDAIInit = {
      token_type: "MockDAI"
    };

    const mockDAIResult = await client.instantiate(
      deployerAccount.address,
      testTokenUpload.codeId, 
      mockDAIInit,
      "Mock DAI",
      "auto"
    );
    console.log(`✅ Mock DAI: ${mockDAIResult.contractAddress}`);

    // 2. Deploy Order Protocol
    console.log("\n📄 2. Deploying Order Protocol...");
    const orderProtocolWasm = fs.readFileSync("target/wasm32-unknown-unknown/release/unite_order_protocol.wasm");
    const orderProtocolUpload = await client.upload(deployerAccount.address, orderProtocolWasm, "auto");
    
    const orderProtocolResult = await client.instantiate(
      deployerAccount.address,
      orderProtocolUpload.codeId,
      {},
      "Unite Order Protocol", 
      "auto"
    );
    console.log(`✅ Order Protocol: ${orderProtocolResult.contractAddress}`);

    // 3. Upload Escrow Code
    console.log("\n📄 3. Uploading Escrow Code...");
    const escrowWasm = fs.readFileSync("target/wasm32-unknown-unknown/release/unite_escrow.wasm");
    const escrowUpload = await client.upload(deployerAccount.address, escrowWasm, "auto");
    console.log(`✅ Escrow Code ID: ${escrowUpload.codeId}`);

    // 4. Deploy Escrow Factory
    console.log("\n📄 4. Deploying Escrow Factory...");
    const escrowFactoryWasm = fs.readFileSync("target/wasm32-unknown-unknown/release/unite_escrow_factory.wasm");
    const escrowFactoryUpload = await client.upload(deployerAccount.address, escrowFactoryWasm, "auto");
    
    const escrowFactoryInit = {
      escrow_code_id: escrowUpload.codeId,
      order_protocol: orderProtocolResult.contractAddress,
    };

    const escrowFactoryResult = await client.instantiate(
      deployerAccount.address,
      escrowFactoryUpload.codeId,
      escrowFactoryInit,
      "Unite Escrow Factory",
      "auto"
    );
    console.log(`✅ Escrow Factory: ${escrowFactoryResult.contractAddress}`);

    // 5. Deploy Resolver Contracts (3 resolvers like EVM)
    console.log("\n📄 5. Deploying Resolver Contracts...");
    const resolverWasm = fs.readFileSync("target/wasm32-unknown-unknown/release/unite_resolver.wasm");
    const resolverUpload = await client.upload(deployerAccount.address, resolverWasm, "auto");

    const resolverInit = {
      factory: escrowFactoryResult.contractAddress,
      order_protocol: orderProtocolResult.contractAddress,
    };

    // Deploy 3 resolver contracts
    const resolver0Result = await client.instantiate(
      deployerAccount.address,
      resolverUpload.codeId,
      resolverInit,
      "Unite Resolver 0",
      "auto"
    );
    console.log(`✅ Resolver 0: ${resolver0Result.contractAddress}`);

    const resolver1Result = await client.instantiate(
      deployerAccount.address,
      resolverUpload.codeId,
      resolverInit,
      "Unite Resolver 1", 
      "auto"
    );
    console.log(`✅ Resolver 1: ${resolver1Result.contractAddress}`);

    const resolver2Result = await client.instantiate(
      deployerAccount.address,
      resolverUpload.codeId,
      resolverInit,
      "Unite Resolver 2",
      "auto"
    );
    console.log(`✅ Resolver 2: ${resolver2Result.contractAddress}`);

    // Save deployment info in EVM-compatible format
    const deploymentData = {
      evm: {
        // This would contain EVM deployments when integrated
      },
      osmosis: {
        chainId: "osmo-test-5",
        name: "Osmosis Testnet",
        UniteOrderProtocol: orderProtocolResult.contractAddress,
        UniteEscrowFactory: escrowFactoryResult.contractAddress,
        UniteResolver0: resolver0Result.contractAddress,
        UniteResolver1: resolver1Result.contractAddress,
        UniteResolver2: resolver2Result.contractAddress,
        MockUSDT: mockUSDTResult.contractAddress,
        MockDAI: mockDAIResult.contractAddress,
        EscrowCodeId: escrowUpload.codeId,
      }
    };

    fs.writeFileSync("deployments.json", JSON.stringify(deploymentData, null, 2));

    console.log("\n=== DEPLOYMENT COMPLETE ===");
    console.log("Chain ID: osmo-test-5");
    console.log("Network: Osmosis Testnet");
    console.log("\n--- Deployed Addresses ---");
    console.log(`UniteOrderProtocol: ${orderProtocolResult.contractAddress}`);
    console.log(`UniteEscrowFactory: ${escrowFactoryResult.contractAddress}`);
    console.log(`UniteResolver0: ${resolver0Result.contractAddress}`);
    console.log(`UniteResolver1: ${resolver1Result.contractAddress}`);
    console.log(`UniteResolver2: ${resolver2Result.contractAddress}`);
    console.log(`MockUSDT: ${mockUSDTResult.contractAddress}`);
    console.log(`MockDAI: ${mockDAIResult.contractAddress}`);
    console.log(`EscrowCodeId: ${escrowUpload.codeId}`);

    console.log("\n--- Copy to deployments.json ---");
    console.log(`"osmosis": {`);
    console.log(`  "chainId": "osmo-test-5",`);
    console.log(`  "name": "Osmosis Testnet",`);
    console.log(`  "UniteOrderProtocol": "${orderProtocolResult.contractAddress}",`);
    console.log(`  "UniteEscrowFactory": "${escrowFactoryResult.contractAddress}",`);
    console.log(`  "UniteResolver0": "${resolver0Result.contractAddress}",`);
    console.log(`  "UniteResolver1": "${resolver1Result.contractAddress}",`);
    console.log(`  "UniteResolver2": "${resolver2Result.contractAddress}",`);
    console.log(`  "MockUSDT": "${mockUSDTResult.contractAddress}",`);
    console.log(`  "MockDAI": "${mockDAIResult.contractAddress}",`);
    console.log(`  "EscrowCodeId": ${escrowUpload.codeId}`);
    console.log(`}`);

    console.log("\n✅ DEPLOYMENT SUCCESSFUL");
    console.log("💾 Deployment info saved to deployments.json");
    console.log("🔗 View on: https://testnet.mintscan.io/osmosis-testnet");

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

deployAll().catch(console.error);