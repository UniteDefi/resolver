import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import * as dotenv from "dotenv";

dotenv.config();

interface ResolverWallet {
  name: string;
  address: string;
  fundingAmount: number; // in SUI
}

const main = async () => {
  try {
    // Setup client and keypair
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("testnet");
    const client = new SuiClient({ url: rpcUrl });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in .env file");
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
    const deployerAddress = keypair.getPublicKey().toSuiAddress();
    
    console.log("💸 Funding Resolver Wallets with SUI");
    console.log("👤 Deployer:", deployerAddress);
    
    // Check deployer balance
    const balance = await client.getBalance({ owner: deployerAddress });
    const balanceInSui = Number(balance.totalBalance) / 1e9;
    console.log("💰 Deployer Balance:", balanceInSui.toFixed(4), "SUI");
    
    // Define resolver wallets to fund
    const resolvers: ResolverWallet[] = [
      {
        name: "Test User",
        address: process.env.SUI_TEST_USER_ADDRESS || "",
        fundingAmount: 0.15, // 0.15 SUI
      },
      {
        name: "Resolver 0",
        address: process.env.SUI_RESOLVER_ADDRESS_0 || "",
        fundingAmount: 0.2, // 0.2 SUI
      },
      {
        name: "Resolver 1", 
        address: process.env.SUI_RESOLVER_ADDRESS_1 || "",
        fundingAmount: 0.2, // 0.2 SUI
      },
      {
        name: "Resolver 2",
        address: process.env.SUI_RESOLVER_ADDRESS_2 || "",
        fundingAmount: 0.2, // 0.2 SUI
      },
      {
        name: "Resolver 3",
        address: process.env.SUI_RESOLVER_ADDRESS_3 || "",
        fundingAmount: 0.2, // 0.2 SUI
      },
    ];
    
    // Filter out resolvers without addresses
    const validResolvers = resolvers.filter(r => r.address && r.address !== "");
    
    if (validResolvers.length === 0) {
      throw new Error("No valid resolver addresses found in .env file");
    }
    
    // Calculate total funding needed
    const totalFunding = validResolvers.reduce((sum, resolver) => sum + resolver.fundingAmount, 0);
    console.log(`💡 Total funding needed: ${totalFunding.toFixed(2)} SUI`);
    
    if (balanceInSui < totalFunding + 0.1) { // Keep 0.1 SUI buffer
      throw new Error(`Insufficient balance. Need ${totalFunding.toFixed(2)} SUI, have ${balanceInSui.toFixed(4)} SUI`);
    }
    
    console.log(`🎯 Funding ${validResolvers.length} resolver wallets...\n`);
    
    // Fund each resolver
    for (const resolver of validResolvers) {
      console.log(`💰 Funding ${resolver.name} (${resolver.address})`);
      
      const tx = new TransactionBlock();
      
      // Split coins to get the exact amount
      const fundingAmountMist = BigInt(resolver.fundingAmount * 1e9); // Convert SUI to MIST
      const [coin] = tx.splitCoins(tx.gas, [fundingAmountMist]);
      
      // Transfer to resolver
      tx.transferObjects([coin], resolver.address);
      
      const result = await client.signAndExecuteTransactionBlock({
        signer: keypair,
        transactionBlock: tx,
        options: {
          showEffects: true,
        },
      });
      
      if (result.effects?.status?.status === "success") {
        console.log(`  ✅ ${resolver.fundingAmount} SUI sent`);
        console.log(`  📄 Tx: ${result.digest}`);
      } else {
        console.log(`  ❌ Failed to fund ${resolver.name}`);
        console.log(`  📄 Tx: ${result.digest}`);
      }
      
      // Small delay between transactions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Check final balance
    const finalBalance = await client.getBalance({ owner: deployerAddress });
    const finalBalanceInSui = Number(finalBalance.totalBalance) / 1e9;
    
    console.log("\n✅ Funding completed!");
    console.log(`💰 Deployer remaining balance: ${finalBalanceInSui.toFixed(4)} SUI`);
    
    // Display summary
    console.log("\n📊 Funding Summary:");
    console.log("==================");
    validResolvers.forEach(resolver => {
      console.log(`${resolver.name}: ${resolver.fundingAmount} SUI`);
    });
    console.log(`Total funded: ${totalFunding.toFixed(2)} SUI`);
    
    // Check balances of funded wallets
    console.log("\n🔍 Verifying wallet balances:");
    console.log("=============================");
    for (const resolver of validResolvers) {
      try {
        const resolverBalance = await client.getBalance({ owner: resolver.address });
        const resolverBalanceInSui = Number(resolverBalance.totalBalance) / 1e9;
        console.log(`${resolver.name}: ${resolverBalanceInSui.toFixed(4)} SUI`);
      } catch (error) {
        console.log(`${resolver.name}: Error checking balance`);
      }
    }
    
  } catch (error) {
    console.error("❌ Funding failed:", error);
    process.exit(1);
  }
};

main().catch(console.error);