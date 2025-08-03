import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

interface WalletStatus {
  name: string;
  address: string;
  osmoBalance: string;
  usdtBalance: string;
  daiBalance: string;
  sufficient: boolean;
}

async function checkAll() {
  console.log("=== CHECKING ALL WALLET BALANCES ===");

  const rpcEndpoint = process.env.OSMO_TESTNET_RPC || "https://rpc.testnet.osmosis.zone";
  const readClient = await StargateClient.connect(rpcEndpoint);

  // Minimum required balances
  const minOsmoBalance = "1000000"; // 1 OSMO minimum
  const minTokenBalance = "1000000"; // 1 TUSDT minimum

  console.log("Minimum requirements:");
  console.log(`- OSMO: ${(parseInt(minOsmoBalance) / 1_000_000).toFixed(2)} OSMO`);
  console.log(`- TUSDT: ${(parseInt(minTokenBalance) / 1_000_000).toFixed(2)} TUSDT`);

  // Get test token addresses
  let mockUSDTAddress: string | undefined;
  let mockDAIAddress: string | undefined;
  try {
    const deploymentData = fs.readFileSync("deployments.json", "utf-8");
    const deployments = JSON.parse(deploymentData);
    mockUSDTAddress = deployments.osmosis?.MockUSDT;
    mockDAIAddress = deployments.osmosis?.MockDAI;
  } catch (error) {
    console.log("⚠️  Could not load deployments.json. Token balances won't be checked.");
  }

  // Define wallets to check
  const walletConfigs = [
    { name: "DEPLOYER", mnemonic: process.env.OSMO_TESTNET_MNEMONIC },
    { name: "USER", mnemonic: process.env.OSMO_USER_MNEMONIC },
    { name: "RESOLVER0", mnemonic: process.env.OSMO_RESOLVER_MNEMONIC_0 },
    { name: "RESOLVER1", mnemonic: process.env.OSMO_RESOLVER_MNEMONIC_1 },
    { name: "RESOLVER2", mnemonic: process.env.OSMO_RESOLVER_MNEMONIC_2 },
  ];

  const walletStatuses: WalletStatus[] = [];

  // Check each wallet
  for (const config of walletConfigs) {
    if (!config.mnemonic) {
      console.log(`⚠️  Skipping ${config.name} - mnemonic not found`);
      continue;
    }

    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(config.mnemonic, { prefix: "osmo" });
      const [account] = await wallet.getAccounts();
      
      // Get native OSMO balance
      const osmoBalance = await readClient.getBalance(account.address, "uosmo");
      
      // Get test token balances
      let usdtBalance = "0";
      let daiBalance = "0";
      if (mockUSDTAddress && mockDAIAddress) {
        try {
          const signingClient = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, wallet);
          const balanceQuery = { balance: { address: account.address } };
          
          const usdtResult = await signingClient.queryContractSmart(mockUSDTAddress, balanceQuery);
          usdtBalance = usdtResult.balance;
          
          const daiResult = await signingClient.queryContractSmart(mockDAIAddress, balanceQuery);
          daiBalance = daiResult.balance;
        } catch (error) {
          // Token balance query failed - might not have any tokens
        }
      }

      const hasEnoughOsmo = parseInt(osmoBalance.amount) >= parseInt(minOsmoBalance);
      const hasEnoughUSDT = parseInt(usdtBalance) >= parseInt(minTokenBalance);
      const hasEnoughDAI = parseInt(daiBalance) >= parseInt(minTokenBalance);
      const sufficient = hasEnoughOsmo && hasEnoughUSDT && hasEnoughDAI;

      walletStatuses.push({
        name: config.name,
        address: account.address,
        osmoBalance: osmoBalance.amount,
        usdtBalance,
        daiBalance,
        sufficient,
      });

    } catch (error) {
      console.error(`❌ Failed to check ${config.name}:`, error);
    }
  }

  // Display results in table format
  console.log("\n┌─────────────┬──────────────────────────────────────────────┬─────────────────┬─────────────────┬─────────────────┬──────────┐");
  console.log("│ Wallet      │ Address                                      │ OSMO Balance    │ USDT Balance    │ DAI Balance     │ Status   │");
  console.log("├─────────────┼──────────────────────────────────────────────┼─────────────────┼─────────────────┼─────────────────┼──────────┤");

  for (const wallet of walletStatuses) {
    const osmoFormatted = (parseInt(wallet.osmoBalance) / 1_000_000).toFixed(2);
    const usdtFormatted = (parseInt(wallet.usdtBalance) / 1_000_000).toFixed(2);
    const daiFormatted = (parseInt(wallet.daiBalance) / 1_000_000).toFixed(2);
    const statusIcon = wallet.sufficient ? "✅" : "❌";
    
    console.log(
      `│ ${wallet.name.padEnd(11)} │ ${wallet.address.padEnd(44)} │ ${(osmoFormatted + " OSMO").padEnd(15)} │ ${(usdtFormatted + " USDT").padEnd(15)} │ ${(daiFormatted + " DAI").padEnd(15)} │ ${(statusIcon + (wallet.sufficient ? " Ready" : " Low")).padEnd(8)} │`
    );
  }

  console.log("└─────────────┴──────────────────────────────────────────────┴─────────────────┴─────────────────┴─────────────────┴──────────┘");

  // Summary
  console.log("\n🔍 Funding Summary:");
  let allReady = true;
  let readyCount = 0;

  for (const wallet of walletStatuses) {
    const hasEnoughOsmo = parseInt(wallet.osmoBalance) >= parseInt(minOsmoBalance);
    const hasEnoughUSDT = parseInt(wallet.usdtBalance) >= parseInt(minTokenBalance);
    const hasEnoughDAI = parseInt(wallet.daiBalance) >= parseInt(minTokenBalance);
    
    if (hasEnoughOsmo && hasEnoughUSDT && hasEnoughDAI) {
      console.log(`✅ ${wallet.name}: Ready for testing`);
      readyCount++;
    } else {
      console.log(`❌ ${wallet.name}: Needs funding (OSMO: ${hasEnoughOsmo ? "✓" : "✗"}, USDT: ${hasEnoughUSDT ? "✓" : "✗"}, DAI: ${hasEnoughDAI ? "✓" : "✗"})`);
      allReady = false;
    }
  }

  console.log(`\n📊 Results: ${readyCount}/${walletStatuses.length} wallets ready`);

  if (allReady) {
    console.log("🎉 All wallets have sufficient funds for testing!");
    console.log("\n▶️  Ready to run tests:");
    console.log("   npm test");
  } else {
    console.log("⚠️  Some wallets need funding. Run funding script:");
    console.log("   npm run fund:all");
    console.log("\n💰 Get testnet OSMO:");
    console.log("   https://faucet.testnet.osmosis.zone/");
  }

  if (mockUSDTAddress && mockDAIAddress) {
    console.log(`\n🪙 Test Tokens:`);
    console.log(`   MockUSDT: ${mockUSDTAddress}`);
    console.log(`   MockDAI: ${mockDAIAddress}`);
  } else {
    console.log("\n⚠️  Test tokens not deployed. Run:");
    console.log("   npm run deploy:all");
  }

  console.log("\n🔗 Osmosis Testnet Explorer:");
  console.log("   https://testnet.mintscan.io/osmosis-testnet");
}

checkAll().catch(console.error);