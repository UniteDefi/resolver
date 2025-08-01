import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function deployContract() {
  const rpcEndpoint = process.env.RPC_ENDPOINT || "http://localhost:26657";
  const mnemonic = process.env.MNEMONIC || "satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn";
  const prefix = "osmo";
  
  console.log("[Deploy] Setting up wallet...");
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix,
  });
  
  const [account] = await wallet.getAccounts();
  const walletAddress = account.address;
  console.log("[Deploy] Wallet address:", walletAddress);
  
  console.log("[Deploy] Connecting to chain...");
  const client = await SigningCosmWasmClient.connectWithSigner(
    rpcEndpoint,
    wallet,
    {
      gasPrice: GasPrice.fromString("0.025uosmo"),
    }
  );
  
  const wasmPath = join(__dirname, "../contracts/counter/target/wasm32-unknown-unknown/release/counter.wasm");
  const wasm = readFileSync(wasmPath);
  
  console.log("[Deploy] Uploading contract...");
  const uploadResult = await client.upload(
    walletAddress,
    wasm,
    "auto"
  );
  
  console.log("[Deploy] Upload successful!");
  console.log("[Deploy] Code ID:", uploadResult.codeId);
  console.log("[Deploy] Transaction hash:", uploadResult.transactionHash);
  
  const instantiateMsg = {
    count: process.env.INITIAL_COUNT || "0",
  };
  
  console.log("[Deploy] Instantiating contract with initial count:", instantiateMsg.count);
  const instantiateResult = await client.instantiate(
    walletAddress,
    uploadResult.codeId,
    instantiateMsg,
    "Counter Contract",
    "auto",
    {
      admin: walletAddress,
    }
  );
  
  console.log("[Deploy] Instantiation successful!");
  console.log("[Deploy] Contract address:", instantiateResult.contractAddress);
  console.log("[Deploy] Transaction hash:", instantiateResult.transactionHash);
  
  const query = { get_count: {} };
  const countResult = await client.queryContractSmart(instantiateResult.contractAddress, query);
  console.log("[Deploy] Initial count verified:", countResult.count);
  
  return {
    codeId: uploadResult.codeId,
    contractAddress: instantiateResult.contractAddress,
  };
}

deployContract()
  .then((result) => {
    console.log("[Deploy] Deployment complete!", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("[Deploy] Error:", error);
    process.exit(1);
  });