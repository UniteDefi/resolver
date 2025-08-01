import { connect, keyStores, Contract, utils } from "near-api-js";
import { config } from "dotenv";
import { join } from "path";

config();

interface CounterContract extends Contract {
  increment(): Promise<void>;
  decrement(): Promise<void>;
  get_value(): Promise<number>;
  reset(): Promise<void>;
}

async function interact() {
  const contractName = process.env.NEAR_CONTRACT_NAME;
  const accountId = process.env.NEAR_ACCOUNT_ID || process.env.NEAR_MASTER_ACCOUNT;
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  
  if (!contractName || !accountId) {
    throw new Error("Please set NEAR_CONTRACT_NAME and NEAR_ACCOUNT_ID in .env file");
  }
  
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
  
  const account = await near.account(accountId);
  
  const contract = new Contract(account, contractName, {
    viewMethods: ["get_value"],
    changeMethods: ["increment", "decrement", "reset"],
  }) as CounterContract;
  
  const command = process.argv[2];
  
  switch (command) {
    case "increment":
      console.log("[Interact] Incrementing counter...");
      await contract.increment();
      console.log("[Interact] Counter incremented!");
      break;
      
    case "decrement":
      console.log("[Interact] Decrementing counter...");
      await contract.decrement();
      console.log("[Interact] Counter decremented!");
      break;
      
    case "reset":
      console.log("[Interact] Resetting counter...");
      await contract.reset();
      console.log("[Interact] Counter reset!");
      break;
      
    case "get":
      console.log("[Interact] Getting counter value...");
      const value = await contract.get_value();
      console.log(`[Interact] Current value: ${value}`);
      break;
      
    default:
      console.log("Usage: npm run interact [increment|decrement|reset|get]");
      process.exit(1);
  }
}

interact().catch((error) => {
  console.error("[Interact] Error:", error);
  process.exit(1);
});