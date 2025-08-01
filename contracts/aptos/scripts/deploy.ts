import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

async function deployCounter() {
  console.log("[Deploy] Starting deployment process...");

  // Configuration
  const network = (process.env.APTOS_NETWORK as Network) || Network.DEVNET;
  const config = new AptosConfig({ network });
  const aptos = new Aptos(config);

  // Account setup
  let account: Account;
  const privateKey = process.env.APTOS_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error("APTOS_PRIVATE_KEY not found in environment variables");
  }

  account = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });

  console.log("[Deploy] Deployer address:", account.accountAddress.toString());

  // Check account balance
  try {
    const balance = await aptos.getAccountResource({
      accountAddress: account.accountAddress,
      resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
    });
    console.log("[Deploy] Account balance:", (balance as any).coin.value);
  } catch (error) {
    console.log("[Deploy] Account might not be initialized yet");
  }

  // Update Move.toml with the actual address
  const moveTomlPath = path.join(__dirname, "..", "Move.toml");
  let moveTomlContent = fs.readFileSync(moveTomlPath, "utf8");
  moveTomlContent = moveTomlContent.replace(
    'counter_addr = "_"',
    `counter_addr = "${account.accountAddress.toString()}"`
  );
  fs.writeFileSync(moveTomlPath, moveTomlContent);
  console.log("[Deploy] Updated Move.toml with deployer address");

  // Compile the module
  console.log("[Deploy] Compiling Move module...");
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

  // Use aptos CLI to publish with direct arguments
  try {
    console.log("[Deploy] Publishing module using Aptos CLI...");
    
    const restUrl = network === Network.DEVNET ? 'https://fullnode.devnet.aptoslabs.com' : 'https://fullnode.testnet.aptoslabs.com';
    
    // Publish using CLI with direct arguments
    const publishCommand = `aptos move publish \
      --private-key "${privateKey}" \
      --url "${restUrl}" \
      --assume-yes`;
      
    execSync(publishCommand, {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });

    console.log("[Deploy] Module deployed successfully!");
    console.log("[Deploy] Module address:", account.accountAddress.toString());
    console.log("[Deploy] Explorer:", `https://explorer.aptoslabs.com/account/${account.accountAddress.toString()}?network=${network}`);
  } catch (error) {
    console.error("[Deploy] Error during deployment:", error);
    throw error;
  }
}

// Run deployment
deployCounter().catch(console.error);