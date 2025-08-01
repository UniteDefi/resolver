import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

async function deployV2() {
  console.log("[Deploy V2] Deploying improved counter contract to testnet...");

  // Initialize Tezos toolkit
  const tezos = new TezosToolkit("https://ghostnet.smartpy.io");
  tezos.setProvider({
    signer: new InMemorySigner(process.env.TEZOS_TESTNET_SECRET_KEY!),
  });

  try {
    // Read compiled contract
    const contractPath = path.join(__dirname, "../output/counter/counter_v2.json");
    const contractCode = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    console.log("[Deploy V2] Deploying contract with initial value: 10");

    // Deploy contract
    const origination = await tezos.contract.originate({
      code: contractCode,
      storage: 10, // Initial value
    });

    console.log("[Deploy V2] Waiting for confirmation...");
    await origination.confirmation();

    const contractAddress = origination.contractAddress!;
    console.log("[Deploy V2] Contract deployed successfully!");
    console.log("[Deploy V2] Contract address:", contractAddress);
    console.log("[Deploy V2] Operation hash:", origination.hash);
    console.log("[Deploy V2] View on explorer: https://ghostnet.tzkt.io/" + contractAddress);

  } catch (error) {
    console.error("[Deploy V2] Deployment failed:", error);
    process.exit(1);
  }
}

// Run deployment
deployV2().catch((error) => {
  console.error("[Deploy V2] Unexpected error:", error);
  process.exit(1);
});