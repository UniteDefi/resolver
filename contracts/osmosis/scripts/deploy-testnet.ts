import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface ContractInfo {
  codeId: number;
  contractAddress: string;
  transactionHash: string;
}

interface DeploymentResult {
  network: string;
  chainId: string;
  deployer: string;
  timestamp: string;
  contracts: {
    orderProtocol: ContractInfo;
    escrowFactory: ContractInfo;
    escrow: { codeId: number };
    resolver: ContractInfo;
    testToken?: ContractInfo;
  };
}

async function deployToTestnet() {
  console.log("[Deploy] Starting Osmosis testnet deployment...");
  
  const rpcEndpoint = process.env.OSMO_TESTNET_RPC || "https://rpc.testnet.osmosis.zone:443";
  const mnemonic = process.env.OSMO_TESTNET_MNEMONIC;
  
  if (!mnemonic) {
    throw new Error("OSMO_TESTNET_MNEMONIC environment variable is required");
  }
  
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "osmo" });
  const [account] = await wallet.getAccounts();
  const deployerAddress = account.address;
  
  console.log("[Deploy] Deployer address:", deployerAddress);
  
  const client = await SigningCosmWasmClient.connectWithSigner(
    rpcEndpoint,
    wallet,
    { gasPrice: GasPrice.fromString("0.025uosmo") }
  );
  
  const balance = await client.getBalance(deployerAddress, "uosmo");
  console.log("[Deploy] Balance:", balance.amount, balance.denom);
  
  if (parseInt(balance.amount) < 10000000) {
    throw new Error("Insufficient balance. Need at least 10 OSMO for deployment");
  }
  
  const contracts = {
    orderProtocol: null as ContractInfo | null,
    escrowFactory: null as ContractInfo | null,
    escrow: { codeId: 0 },
    resolver: null as ContractInfo | null,
    testToken: null as ContractInfo | null,
  };
  
  try {
    console.log("\n[Deploy] Step 1: Deploying Order Protocol...");
    const orderProtocolWasm = readFileSync(
      join(__dirname, "../contracts/unite-order-protocol/target/wasm32-unknown-unknown/release/unite_order_protocol.wasm")
    );
    
    const orderProtocolUpload = await client.upload(deployerAddress, orderProtocolWasm, "auto");
    console.log("[Deploy] Order Protocol uploaded, Code ID:", orderProtocolUpload.codeId);
    
    const orderProtocolInstantiate = await client.instantiate(
      deployerAddress,
      orderProtocolUpload.codeId,
      {},
      "Unite Order Protocol",
      "auto",
      { admin: deployerAddress }
    );
    
    contracts.orderProtocol = {
      codeId: orderProtocolUpload.codeId,
      contractAddress: orderProtocolInstantiate.contractAddress,
      transactionHash: orderProtocolInstantiate.transactionHash,
    };
    
    console.log("[Deploy] Order Protocol deployed:", contracts.orderProtocol.contractAddress);
    
    console.log("\n[Deploy] Step 2: Uploading Escrow contract...");
    const escrowWasm = readFileSync(
      join(__dirname, "../contracts/unite-escrow/target/wasm32-unknown-unknown/release/unite_escrow.wasm")
    );
    
    const escrowUpload = await client.upload(deployerAddress, escrowWasm, "auto");
    contracts.escrow.codeId = escrowUpload.codeId;
    console.log("[Deploy] Escrow uploaded, Code ID:", contracts.escrow.codeId);
    
    console.log("\n[Deploy] Step 3: Deploying Escrow Factory...");
    const factoryWasm = readFileSync(
      join(__dirname, "../contracts/unite-escrow-factory/target/wasm32-unknown-unknown/release/unite_escrow_factory.wasm")
    );
    
    const factoryUpload = await client.upload(deployerAddress, factoryWasm, "auto");
    console.log("[Deploy] Factory uploaded, Code ID:", factoryUpload.codeId);
    
    const factoryInstantiate = await client.instantiate(
      deployerAddress,
      factoryUpload.codeId,
      {
        escrow_code_id: contracts.escrow.codeId,
        resolver_code_id: 0,
      },
      "Unite Escrow Factory",
      "auto",
      { admin: deployerAddress }
    );
    
    contracts.escrowFactory = {
      codeId: factoryUpload.codeId,
      contractAddress: factoryInstantiate.contractAddress,
      transactionHash: factoryInstantiate.transactionHash,
    };
    
    console.log("[Deploy] Escrow Factory deployed:", contracts.escrowFactory.contractAddress);
    
    console.log("\n[Deploy] Step 4: Deploying Resolver...");
    const resolverWasm = readFileSync(
      join(__dirname, "../contracts/unite-resolver/target/wasm32-unknown-unknown/release/unite_resolver.wasm")
    );
    
    const resolverUpload = await client.upload(deployerAddress, resolverWasm, "auto");
    console.log("[Deploy] Resolver uploaded, Code ID:", resolverUpload.codeId);
    
    const resolverInstantiate = await client.instantiate(
      deployerAddress,
      resolverUpload.codeId,
      {
        escrow_factory: contracts.escrowFactory.contractAddress,
        order_protocol: contracts.orderProtocol.contractAddress,
      },
      "Unite Resolver",
      "auto",
      { admin: deployerAddress }
    );
    
    contracts.resolver = {
      codeId: resolverUpload.codeId,
      contractAddress: resolverInstantiate.contractAddress,
      transactionHash: resolverInstantiate.transactionHash,
    };
    
    console.log("[Deploy] Resolver deployed:", contracts.resolver.contractAddress);
    
    const deployment: DeploymentResult = {
      network: "osmosis-testnet",
      chainId: "osmo-test-5",
      deployer: deployerAddress,
      timestamp: new Date().toISOString(),
      contracts: contracts as any,
    };
    
    const deploymentsPath = join(__dirname, "../deployments.json");
    let existingDeployments: any = {};
    
    try {
      existingDeployments = JSON.parse(readFileSync(deploymentsPath, "utf-8"));
    } catch (e) {
      console.log("[Deploy] Creating new deployments file");
    }
    
    existingDeployments.osmosis = deployment;
    writeFileSync(deploymentsPath, JSON.stringify(existingDeployments, null, 2));
    
    console.log("\n[Deploy] ✅ Deployment completed successfully!");
    console.log("[Deploy] Results saved to deployments.json");
    console.log("\n=== Contract Addresses ===");
    console.log("Order Protocol:", contracts.orderProtocol?.contractAddress);
    console.log("Escrow Factory:", contracts.escrowFactory?.contractAddress);
    console.log("Resolver:", contracts.resolver?.contractAddress);
    
    return deployment;
    
  } catch (error) {
    console.error("[Deploy] Deployment failed:", error);
    throw error;
  }
}

if (require.main === module) {
  deployToTestnet()
    .then((result) => {
      console.log("[Deploy] Success!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[Deploy] Failed:", error);
      process.exit(1);
    });
}

export { deployToTestnet };
