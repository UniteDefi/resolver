#!/usr/bin/env ts-node

import {
  Keypair,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Networks,
  xdr,
  Address,
  StrKey,
  hash,
} from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function deployWithSDK() {
  console.log("[Deploy SDK] Starting deployment with Stellar SDK...");

  const secretKey = process.env.STELLAR_SECRET_KEY;
  if (!secretKey) {
    console.error("[Deploy SDK] STELLAR_SECRET_KEY not found in .env");
    process.exit(1);
  }

  const sourceKeypair = Keypair.fromSecret(secretKey);
  console.log("[Deploy SDK] Using account:", sourceKeypair.publicKey());

  // Initialize server connection
  const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");

  try {
    // Step 1: Load the account
    console.log("[Deploy SDK] Loading account...");
    const account = await server.getAccount(sourceKeypair.publicKey());
    console.log("[Deploy SDK] Account loaded. Sequence:", account.sequenceNumber());

    // Step 2: Read the WASM file
    const wasmPath = join(__dirname, "..", "target", "wasm32-unknown-unknown", "release", "counter.wasm");
    const wasmBuffer = readFileSync(wasmPath);
    console.log("[Deploy SDK] WASM loaded. Size:", wasmBuffer.length, "bytes");

    // Step 3: Upload contract WASM
    console.log("[Deploy SDK] Uploading contract WASM...");
    const uploadTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
      .setTimeout(30)
      .build();

    const preparedUpload = await server.prepareTransaction(uploadTx);
    preparedUpload.sign(sourceKeypair);
    
    console.log("[Deploy SDK] Submitting WASM upload transaction...");
    const uploadResult = await server.sendTransaction(preparedUpload);
    
    // Wait for upload confirmation
    let uploadResponse = await waitForTransaction(server, uploadResult.hash);
    
    if (uploadResponse.status !== "SUCCESS") {
      throw new Error("Failed to upload WASM");
    }

    // Extract WASM hash from the result
    const wasmId = extractWasmId(uploadResponse);
    console.log("[Deploy SDK] WASM uploaded. Hash:", wasmId);

    // Step 4: Create contract instance
    console.log("[Deploy SDK] Creating contract instance...");
    const createTx = new TransactionBuilder(
      await server.getAccount(sourceKeypair.publicKey()), // Reload account for new sequence
      {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      }
    )
      .addOperation(
        Operation.createContract({
          wasmHash: Buffer.from(wasmId, "hex"),
          address: Address.fromString(sourceKeypair.publicKey()),
          salt: Buffer.alloc(32, Date.now()),
        })
      )
      .setTimeout(30)
      .build();

    const preparedCreate = await server.prepareTransaction(createTx);
    preparedCreate.sign(sourceKeypair);
    
    console.log("[Deploy SDK] Submitting contract creation transaction...");
    const createResult = await server.sendTransaction(preparedCreate);
    
    // Wait for creation confirmation
    let createResponse = await waitForTransaction(server, createResult.hash);
    
    if (createResponse.status !== "SUCCESS") {
      throw new Error("Failed to create contract");
    }

    // Extract contract ID
    const contractId = extractContractId(createResponse);
    console.log("[Deploy SDK] Contract deployed successfully!");
    console.log("[Deploy SDK] Contract ID:", contractId);

    // Save deployment info
    const deploymentInfo = {
      contractId: contractId,
      wasmHash: wasmId,
      network: "testnet",
      deployedAt: new Date().toISOString(),
      deployer: sourceKeypair.publicKey(),
    };

    const deploymentPath = join(__dirname, "..", "deployment-testnet.json");
    writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("[Deploy SDK] Deployment info saved to:", deploymentPath);

    // Test the contract
    console.log("[Deploy SDK] Testing contract...");
    await testContract(server, sourceKeypair, contractId);

  } catch (error) {
    console.error("[Deploy SDK] Deployment failed:", error);
    process.exit(1);
  }
}

async function waitForTransaction(
  server: SorobanRpc.Server,
  hash: string,
  maxAttempts = 20
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await server.getTransaction(hash);
    if (response.status !== "NOT_FOUND") {
      return response;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Transaction timeout");
}

function extractWasmId(response: SorobanRpc.Api.GetTransactionResponse): string {
  if (!response.returnValue) {
    throw new Error("No return value in transaction");
  }
  // The WASM hash is returned as bytes
  const wasmHashXdr = response.returnValue;
  const wasmHashBytes = wasmHashXdr.bytes();
  return Buffer.from(wasmHashBytes).toString("hex");
}

function extractContractId(response: SorobanRpc.Api.GetTransactionResponse): string {
  if (!response.returnValue) {
    throw new Error("No return value in transaction");
  }
  // Contract address is returned
  const contractAddress = Address.fromScVal(response.returnValue);
  return contractAddress.toString();
}

async function testContract(
  server: SorobanRpc.Server,
  sourceKeypair: Keypair,
  contractId: string
) {
  try {
    const contract = new Contract(contractId);
    
    // Test get_count
    console.log("[Deploy SDK] Testing get_count...");
    const account = await server.getAccount(sourceKeypair.publicKey());
    
    const getTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call("get_count"))
      .setTimeout(30)
      .build();

    const preparedGet = await server.prepareTransaction(getTx);
    const sim = await server.simulateTransaction(preparedGet);
    
    if (SorobanRpc.Api.isSimulationSuccess(sim)) {
      console.log("[Deploy SDK] Simulation successful. Initial count should be 0");
    }

  } catch (error) {
    console.error("[Deploy SDK] Test failed:", error);
  }
}

// Run deployment
deployWithSDK().catch(error => {
  console.error("[Deploy SDK] Unexpected error:", error);
  process.exit(1);
});