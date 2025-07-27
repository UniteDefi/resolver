import { connect, keyStores, utils } from "near-api-js";
import * as fs from "fs";
import * as path from "path";
import { NEAR_CONFIG } from "../config";

async function deployContracts() {
  console.log("[Deploy/Near] Starting Near contract deployment...");
  
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = utils.KeyPair.fromString(process.env.NEAR_PRIVATE_KEY!);
  await keyStore.setKey(NEAR_CONFIG.networkId, NEAR_CONFIG.contractName, keyPair);

  const near = await connect({
    ...NEAR_CONFIG,
    keyStore,
  });

  const account = await near.account(NEAR_CONFIG.contractName);
  
  // Deploy Dutch Auction Contract
  const auctionWasm = fs.readFileSync(
    path.join(__dirname, "../../../target/wasm32-unknown-unknown/release/dutch_auction.wasm")
  );
  
  console.log("[Deploy/Near] Deploying Dutch Auction contract...");
  const auctionContractId = `auction.${NEAR_CONFIG.contractName}`;
  
  try {
    await account.createAndDeployContract(
      auctionContractId,
      keyPair.getPublicKey(),
      auctionWasm,
      utils.format.parseNearAmount("10")!
    );
    console.log("[Deploy/Near] Dutch Auction deployed to:", auctionContractId);
  } catch (error: any) {
    if (error.type === "AccountAlreadyExists") {
      console.log("[Deploy/Near] Dutch Auction contract already exists, redeploying...");
      const auctionAccount = await near.account(auctionContractId);
      await auctionAccount.deployContract(auctionWasm);
    } else {
      throw error;
    }
  }

  // Deploy HTLC Escrow Contract
  const htlcWasm = fs.readFileSync(
    path.join(__dirname, "../../../target/wasm32-unknown-unknown/release/htlc_escrow.wasm")
  );
  
  console.log("[Deploy/Near] Deploying HTLC Escrow contract...");
  const htlcContractId = `htlc.${NEAR_CONFIG.contractName}`;
  
  try {
    await account.createAndDeployContract(
      htlcContractId,
      keyPair.getPublicKey(),
      htlcWasm,
      utils.format.parseNearAmount("10")!
    );
    console.log("[Deploy/Near] HTLC Escrow deployed to:", htlcContractId);
  } catch (error: any) {
    if (error.type === "AccountAlreadyExists") {
      console.log("[Deploy/Near] HTLC contract already exists, redeploying...");
      const htlcAccount = await near.account(htlcContractId);
      await htlcAccount.deployContract(htlcWasm);
    } else {
      throw error;
    }
  }

  // Initialize contracts
  const auctionAccount = await near.account(auctionContractId);
  const htlcAccount = await near.account(htlcContractId);

  console.log("[Deploy/Near] Initializing contracts...");
  
  await auctionAccount.functionCall({
    contractId: auctionContractId,
    methodName: "new",
    args: {},
  });

  await htlcAccount.functionCall({
    contractId: htlcContractId,
    methodName: "new",
    args: {},
  });

  console.log("[Deploy/Near] Deployment complete!");
  console.log("[Deploy/Near] Contracts deployed:");
  console.log(`  - Dutch Auction: ${auctionContractId}`);
  console.log(`  - HTLC Escrow: ${htlcContractId}`);

  return {
    auctionContractId,
    htlcContractId,
  };
}

if (require.main === module) {
  deployContracts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[Deploy/Near] Error:", error);
      process.exit(1);
    });
}

export { deployContracts };