import { connect, keyStores, KeyPair, utils } from "near-api-js";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { execSync } from "child_process";

config();

async function deploy() {
  console.log("[Deploy] Starting deployment process...");
  
  const contractName = process.env.NEAR_CONTRACT_NAME;
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  const masterAccount = process.env.NEAR_MASTER_ACCOUNT;
  
  if (!contractName || !masterAccount) {
    throw new Error("Please set NEAR_CONTRACT_NAME and NEAR_MASTER_ACCOUNT in .env file");
  }
  
  console.log("[Deploy] Building contract...");
  execSync("cargo build --target wasm32-unknown-unknown --release", {
    cwd: join(__dirname, ".."),
    stdio: "inherit"
  });
  
  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    join(process.env.HOME || "", ".near-credentials")
  );
  
  const near = await connect({
    networkId,
    keyStore,
    nodeUrl: process.env.NEAR_NODE_URL || `https://rpc.${networkId}.near.org`,
    walletUrl: `https://wallet.${networkId}.near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
  });
  
  const account = await near.account(masterAccount);
  
  const contractPath = join(
    __dirname,
    "../target/wasm32-unknown-unknown/release/counter.wasm"
  );
  const contractWasm = readFileSync(contractPath);
  
  console.log(`[Deploy] Contract size: ${contractWasm.length} bytes`);
  
  try {
    const contractAccount = await near.account(contractName);
    console.log("[Deploy] Contract account exists, deploying contract...");
    await contractAccount.deployContract(contractWasm);
  } catch (error: any) {
    if (error.type === "AccountDoesNotExist") {
      console.log("[Deploy] Creating new contract account...");
      const keyPair = KeyPair.fromRandom("ed25519");
      await account.createAndDeployContract(
        contractName,
        keyPair.getPublicKey(),
        contractWasm,
        utils.format.parseNearAmount("5") || "0"
      );
    } else {
      throw error;
    }
  }
  
  console.log(`[Deploy] Contract deployed successfully to: ${contractName}`);
  console.log(`[Deploy] View in explorer: https://explorer.${networkId}.near.org/accounts/${contractName}`);
}

deploy().catch((error) => {
  console.error("[Deploy] Error:", error);
  process.exit(1);
});