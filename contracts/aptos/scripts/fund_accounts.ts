import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface WalletData {
  address: string;
  privateKey: string;
  name: string;
}

async function fundAccounts(): Promise<void> {
  console.log("[Fund] Starting APT distribution...");

  // Configuration
  const network = (process.env.APTOS_NETWORK as Network) || Network.TESTNET;
  const config = new AptosConfig({ network });
  const aptos = new Aptos(config);

  // Get deployer account (funded)
  const deployerPrivateKey = process.env.APTOS_PRIVATE_KEY;
  if (!deployerPrivateKey) {
    throw new Error("APTOS_PRIVATE_KEY not found in environment variables");
  }

  const deployer = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(deployerPrivateKey),
  });

  console.log("[Fund] Deployer address:", deployer.accountAddress.toString());

  // Check deployer balance
  try {
    const deployerBalance = await aptos.getAccountResource({
      accountAddress: deployer.accountAddress,
      resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
    });
    console.log("[Fund] Deployer balance:", (deployerBalance as any).coin.value);
  } catch (error) {
    console.log("[Fund] Deployer account not initialized, will initialize during first transfer");
  }

  // Define recipients with minimal funding amounts (in octas, 1 APT = 100,000,000 octas)
  const recipients: WalletData[] = [
    {
      address: process.env.APTOS_USER_ADDRESS!,
      privateKey: process.env.APTOS_USER_PRIVATE_KEY!,
      name: "User",
    },
    {
      address: process.env.APTOS_RESOLVER_ADDRESS_0!,
      privateKey: process.env.APTOS_RESOLVER_PRIVATE_KEY_0!,
      name: "Resolver 0",
    },
    {
      address: process.env.APTOS_RESOLVER_ADDRESS_1!,
      privateKey: process.env.APTOS_RESOLVER_PRIVATE_KEY_1!,
      name: "Resolver 1",
    },
    {
      address: process.env.APTOS_RESOLVER_ADDRESS_2!,
      privateKey: process.env.APTOS_RESOLVER_PRIVATE_KEY_2!,
      name: "Resolver 2",
    },
    {
      address: process.env.APTOS_RESOLVER_ADDRESS_3!,
      privateKey: process.env.APTOS_RESOLVER_PRIVATE_KEY_3!,
      name: "Resolver 3",
    },
  ];

  // Funding amounts (conservative for gas only)
  const FUNDING_AMOUNTS = {
    user: 50_000_000, // 0.5 APT for user (testing transactions)
    resolver: 20_000_000, // 0.2 APT per resolver (gas for operations)
  };

  const results = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const isUser = recipient.name === "User";
    const amount = isUser ? FUNDING_AMOUNTS.user : FUNDING_AMOUNTS.resolver;

    try {
      console.log(`\n[Fund] Funding ${recipient.name} (${recipient.address})...`);

      // Transfer APT from deployer to recipient
      const transferTxn = await aptos.transaction.build.simple({
        sender: deployer.accountAddress,
        data: {
          function: "0x1::aptos_account::transfer",
          functionArguments: [recipient.address, amount],
        },
      });

      const transferResult = await aptos.signAndSubmitTransaction({
        signer: deployer,
        transaction: transferTxn,
      });

      await aptos.waitForTransaction({
        transactionHash: transferResult.hash,
      });

      console.log(`[Fund] ✅ ${recipient.name}: ${amount / 100_000_000} APT transferred`);
      console.log(`[Fund] Tx: ${transferResult.hash}`);

      results.push({
        recipient: recipient.name,
        address: recipient.address,
        amount: amount / 100_000_000,
        txHash: transferResult.hash,
        success: true,
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`[Fund] ❌ Failed to fund ${recipient.name}:`, error);
      results.push({
        recipient: recipient.name,
        address: recipient.address,
        amount: amount / 100_000_000,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Summary
  console.log("\n[Fund] 📊 Funding Summary:");
  let totalFunded = 0;
  let successCount = 0;

  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.recipient}: ${result.amount} APT`);
      totalFunded += result.amount;
      successCount++;
    } else {
      console.log(`❌ ${result.recipient}: Failed`);
    }
  });

  console.log(`\n[Fund] Total distributed: ${totalFunded} APT`);
  console.log(`[Fund] Success rate: ${successCount}/${results.length}`);
  
  // Save funding results
  const fundingPath = path.join(__dirname, "..", "funding_results.json");
  fs.writeFileSync(fundingPath, JSON.stringify(results, null, 2));
  console.log("[Fund] Results saved to funding_results.json");
}

// Run if called directly
if (require.main === module) {
  fundAccounts().catch(error => {
    console.error("[Fund] ❌ Funding failed:", error);
    process.exit(1);
  });
}

export { fundAccounts };