import { SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";
import * as path from "path";
import deployments from "../deployments.json";

dotenv.config({ path: path.join(__dirname, "../.env") });

interface FundingConfig {
  suiAmount: number;    // SUI amount to send (in SUI, not MIST)
  usdcAmount: number;   // USDC amount to mint (in USDC units)
}

const DEFAULT_FUNDING: FundingConfig = {
  suiAmount: 10,        // 10 SUI
  usdcAmount: 1000,     // 1000 USDC
};

async function fundResolver(
  client: SuiClient,
  funderKeypair: Ed25519Keypair,
  resolverAddress: string,
  config: FundingConfig,
  suiConfig: any
): Promise<void> {
  console.log(`[Fund] Funding resolver: ${resolverAddress}`);
  
  const tx = new TransactionBlock();
  
  // Send SUI
  const suiAmountMist = config.suiAmount * 1e9; // Convert to MIST
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure(suiAmountMist)]);
  tx.transferObjects([suiCoin], tx.pure(resolverAddress));
  
  // Mint and send USDC
  if (suiConfig.MockUSDC && config.usdcAmount > 0) {
    const usdcAmountRaw = config.usdcAmount * 1e6; // 6 decimals
    
    tx.moveCall({
      target: `${suiConfig.packageId}::mock_usdc::mint_and_transfer`,
      arguments: [
        tx.object(suiConfig.MockUSDC),
        tx.pure(usdcAmountRaw),
        tx.pure(resolverAddress),
      ],
    });
  }
  
  try {
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: funderKeypair,
      options: {
        showEffects: true,
      },
    });
    
    if (result.effects?.status.status === "success") {
      console.log(`✅ Funded resolver ${resolverAddress}`);
      console.log(`   SUI: ${config.suiAmount}`);
      console.log(`   USDC: ${config.usdcAmount}`);
      console.log(`   Tx: ${result.digest}`);
    } else {
      console.log(`❌ Failed to fund resolver ${resolverAddress}`);
      console.log(`   Error: ${result.effects?.status.error}`);
    }
  } catch (error: any) {
    console.log(`❌ Failed to fund resolver ${resolverAddress}: ${error.message}`);
  }
}

async function checkBalances(
  client: SuiClient,
  addresses: string[],
  suiConfig: any
): Promise<void> {
  console.log("\n=== BALANCE CHECK ===");
  
  for (const address of addresses) {
    try {
      // Check SUI balance
      const suiBalance = await client.getBalance({ owner: address });
      const suiAmount = parseInt(suiBalance.totalBalance) / 1e9;
      
      // Check USDC balance if treasury exists
      let usdcAmount = 0;
      if (suiConfig.MockUSDC) {
        try {
          const usdcCoins = await client.getCoins({
            owner: address,
            coinType: `${suiConfig.packageId}::mock_usdc::MOCK_USDC`,
          });
          usdcAmount = usdcCoins.data.reduce((sum, coin) => sum + parseInt(coin.balance), 0) / 1e6;
        } catch (error) {
          // USDC not found or not minted yet
        }
      }
      
      console.log(`${address}:`);
      console.log(`  SUI: ${suiAmount.toFixed(4)}`);
      console.log(`  USDC: ${usdcAmount.toFixed(2)}`);
    } catch (error: any) {
      console.log(`${address}: Error checking balance - ${error.message}`);
    }
  }
}

async function main() {
  const network = process.env.SUI_NETWORK || "testnet";
  const rpcUrl = process.env.SUI_RPC_URL || `https://fullnode.${network}.sui.io`;
  
  const client = new SuiClient({ url: rpcUrl });
  
  // Get funder keypair (main account)
  const funderPrivateKey = process.env.SUI_PRIVATE_KEY;
  if (!funderPrivateKey) {
    throw new Error("SUI_PRIVATE_KEY not set in environment");
  }
  
  const funderKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(funderPrivateKey, "hex"));
  const funderAddress = funderKeypair.toSuiAddress();
  
  console.log(`[Fund] Funding resolvers on Sui ${network}`);
  console.log(`[Fund] Funder address: ${funderAddress}`);
  console.log(`[Fund] RPC URL: ${rpcUrl}`);
  
  // Get Sui configuration
  const suiConfig = deployments.sui?.[network];
  if (!suiConfig) {
    throw new Error(`No deployment configuration found for Sui ${network}`);
  }
  
  console.log(`[Fund] Package ID: ${suiConfig.packageId}`);
  console.log(`[Fund] MockUSDC Treasury: ${suiConfig.MockUSDC}`);
  
  // Get resolver private keys
  const resolverKeys = [
    process.env.SUI_RESOLVER_PRIVATE_KEY_0,
    process.env.SUI_RESOLVER_PRIVATE_KEY_1,
    process.env.SUI_RESOLVER_PRIVATE_KEY_2,
  ];
  
  // Generate resolver addresses
  const resolverAddresses = resolverKeys
    .filter(key => key) // Filter out undefined keys
    .map(key => Ed25519Keypair.fromSecretKey(Buffer.from(key!, "hex")).toSuiAddress());
  
  if (resolverAddresses.length === 0) {
    console.log("⚠️ No resolver private keys found. Set SUI_RESOLVER_PRIVATE_KEY_0, etc.");
    process.exit(1);
  }
  
  console.log(`[Fund] Found ${resolverAddresses.length} resolver addresses`);
  
  // Check funder balance
  const funderBalance = await client.getBalance({ owner: funderAddress });
  const funderSui = parseInt(funderBalance.totalBalance) / 1e9;
  console.log(`[Fund] Funder SUI balance: ${funderSui.toFixed(4)}`);
  
  const requiredSui = resolverAddresses.length * DEFAULT_FUNDING.suiAmount;
  if (funderSui < requiredSui) {
    console.log(`❌ Insufficient SUI balance. Need ${requiredSui}, have ${funderSui.toFixed(4)}`);
    process.exit(1);
  }
  
  // Check current balances
  const allAddresses = [funderAddress, ...resolverAddresses];
  await checkBalances(client, allAddresses, suiConfig);
  
  // Fund resolvers
  console.log("\n=== FUNDING RESOLVERS ===");
  for (const resolverAddress of resolverAddresses) {
    await fundResolver(client, funderKeypair, resolverAddress, DEFAULT_FUNDING, suiConfig);
    
    // Small delay between transactions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Final balance check
  console.log("\n=== FINAL BALANCES ===");
  await checkBalances(client, allAddresses, suiConfig);
  
  console.log("\n✅ Resolver funding completed!");
  console.log("\n--- Next Steps ---");
  console.log("1. Run cross-chain tests: npm run test:cross-chain");
  console.log("2. Or run unit tests: npm run test:unit");
  console.log(`3. Check transactions on: https://suiexplorer.com/?network=${network}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error("[Fund] Error:", error);
    process.exit(1);
  });
}

export { fundResolver, checkBalances };