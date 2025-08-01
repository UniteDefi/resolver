import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { ContractPromise } from "@polkadot/api-contract";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const network = process.env.NETWORK || "local";
  const wsUrl = process.env.SUBSTRATE_WS_URL || "ws://127.0.0.1:9944";
  
  const wsProvider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider: wsProvider });
  
  console.log("[Interact] Connected to:", (await api.rpc.system.chain()).toString());

  const keyring = new Keyring({ type: "sr25519" });
  const alice = keyring.addFromUri("//Alice");

  const deploymentsPath = path.join(__dirname, "../deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("No deployments found. Please deploy the contract first.");
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const deployment = deployments[network]?.counter;
  
  if (!deployment) {
    throw new Error(`No counter contract found for network: ${network}`);
  }

  console.log("[Interact] Using contract at:", deployment.address);

  const contractPath = path.join(__dirname, "../counter/target/ink/counter.contract");
  const contractJson = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const metadata = JSON.stringify(contractJson);

  const contract = new ContractPromise(api, metadata, deployment.address);

  const command = process.argv[2];
  
  switch (command) {
    case "get":
      const { output: value } = await contract.query.get(alice.address, { gasLimit: -1 });
      console.log("[Interact] Counter value:", value?.toHuman());
      break;
      
    case "increment":
      console.log("[Interact] Incrementing counter...");
      await contract.tx
        .increment({ gasLimit: -1 })
        .signAndSend(alice, ({ status }) => {
          if (status.isFinalized) {
            console.log("[Interact] Increment successful!");
            process.exit(0);
          }
        });
      break;
      
    case "decrement":
      console.log("[Interact] Decrementing counter...");
      await contract.tx
        .decrement({ gasLimit: -1 })
        .signAndSend(alice, ({ status, dispatchError }) => {
          if (status.isFinalized) {
            if (dispatchError) {
              console.error("[Interact] Decrement failed:", dispatchError.toString());
            } else {
              console.log("[Interact] Decrement successful!");
            }
            process.exit(0);
          }
        });
      break;
      
    case "owner":
      const { output: owner } = await contract.query.getOwner(alice.address, { gasLimit: -1 });
      console.log("[Interact] Contract owner:", owner?.toString());
      break;
      
    default:
      console.log("Usage: ts-node interact.ts [get|increment|decrement|owner]");
      process.exit(1);
  }
}

main().catch(console.error);