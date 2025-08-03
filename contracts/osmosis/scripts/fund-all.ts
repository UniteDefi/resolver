import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, StargateClient } from "@cosmjs/stargate";
import { coin } from "@cosmjs/stargate";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

interface WalletInfo {
  name: string;
  mnemonic?: string;
  amount: string; // OSMO amount in uosmo
  tokenAmount: string; // Test token amount
}

async function fundAll() {
  console.log("=== FUNDING ALL WALLETS ===");

  // Get funding configuration from environment or use defaults
  const fundTargets = process.env.FUND_TARGETS || "all"; // "all" or "user,resolver0,resolver1"
  const osmoAmount = process.env.FUND_AMOUNT || "5000000"; // 5 OSMO default
  const tokenAmount = process.env.TOKEN_AMOUNT || "10000000000"; // 10k test tokens default

  console.log("Targets:", fundTargets);
  console.log("OSMO per wallet:", (parseInt(osmoAmount) / 1_000_000).toFixed(2), "OSMO");
  console.log("Tokens per wallet:", (parseInt(tokenAmount) / 1_000_000).toFixed(2), "TUSDT");

  // Setup deployer wallet (has funds)
  const deployerMnemonic = process.env.OSMO_TESTNET_MNEMONIC;
  if (!deployerMnemonic) {
    throw new Error("OSMO_TESTNET_MNEMONIC environment variable not set");
  }

  const deployerWallet = await DirectSecp256k1HdWallet.fromMnemonic(deployerMnemonic, { prefix: "osmo" });
  const [deployerAccount] = await deployerWallet.getAccounts();
  
  const rpcEndpoint = process.env.OSMO_TESTNET_RPC || "https://rpc.testnet.osmosis.zone";
  const gasPrice = GasPrice.fromString("0.025uosmo");
  const client = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, deployerWallet, { gasPrice });
  const readClient = await StargateClient.connect(rpcEndpoint);

  console.log("Deployer:", deployerAccount.address);

  // Check deployer balance
  const deployerBalance = await readClient.getBalance(deployerAccount.address, "uosmo");
  console.log(`Deployer balance: ${(parseInt(deployerBalance.amount) / 1_000_000).toFixed(2)} OSMO`);

  // Define wallets to fund (similar to EVM structure)
  const walletConfigs: WalletInfo[] = [
    { name: "user", mnemonic: process.env.OSMO_USER_MNEMONIC, amount: osmoAmount, tokenAmount },
    { name: "resolver0", mnemonic: process.env.OSMO_RESOLVER_MNEMONIC_0, amount: osmoAmount, tokenAmount },
    { name: "resolver1", mnemonic: process.env.OSMO_RESOLVER_MNEMONIC_1, amount: osmoAmount, tokenAmount },
    { name: "resolver2", mnemonic: process.env.OSMO_RESOLVER_MNEMONIC_2, amount: osmoAmount, tokenAmount },
  ];

  // Parse targets
  const shouldFundAll = fundTargets.toLowerCase() === "all";
  const targetList = shouldFundAll ? [] : fundTargets.toLowerCase().split(",");

  // Filter wallets based on targets
  const walletsToFund = walletConfigs.filter(wallet => {
    if (!wallet.mnemonic) {
      console.log(`⚠️  Warning: ${wallet.name.toUpperCase()}_MNEMONIC not found`);
      return false;
    }
    return shouldFundAll || targetList.includes(wallet.name);
  });

  if (walletsToFund.length === 0) {
    console.log("❌ No valid wallets to fund");
    console.log("Valid targets: user, resolver0, resolver1, resolver2, all");
    console.log("Set FUND_TARGETS environment variable");
    return;
  }

  // Calculate total required
  const totalOsmoRequired = walletsToFund.length * parseInt(osmoAmount);
  if (parseInt(deployerBalance.amount) < totalOsmoRequired) {
    console.log("❌ Insufficient deployer balance");
    console.log(`Required: ${(totalOsmoRequired / 1_000_000).toFixed(2)} OSMO`);
    console.log(`Available: ${(parseInt(deployerBalance.amount) / 1_000_000).toFixed(2)} OSMO`);
    return;
  }

  console.log(`\n--- Funding ${walletsToFund.length} wallets ---`);

  // Fund native OSMO
  let successCount = 0;
  for (const walletConfig of walletsToFund) {
    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(walletConfig.mnemonic!, { prefix: "osmo" });
      const [account] = await wallet.getAccounts();
      
      console.log(`\n💰 Funding ${walletConfig.name.toUpperCase()} (${account.address})`);
      
      // Check current balance
      const currentBalance = await readClient.getBalance(account.address, "uosmo");
      console.log(`Current: ${(parseInt(currentBalance.amount) / 1_000_000).toFixed(2)} OSMO`);
      
      // Skip if already has enough
      if (parseInt(currentBalance.amount) >= parseInt(walletConfig.amount)) {
        console.log(`✅ ${walletConfig.name.toUpperCase()} already has sufficient OSMO`);
        successCount++;
        continue;
      }

      // Send native OSMO
      const sendResult = await client.sendTokens(
        deployerAccount.address,
        account.address,
        [coin(walletConfig.amount, "uosmo")],
        "auto",
        `Funding ${walletConfig.name}`
      );

      console.log(`✅ Sent ${(parseInt(walletConfig.amount) / 1_000_000).toFixed(2)} OSMO (tx: ${sendResult.transactionHash})`);
      
      const newBalance = await readClient.getBalance(account.address, "uosmo");
      console.log(`New balance: ${(parseInt(newBalance.amount) / 1_000_000).toFixed(2)} OSMO`);
      successCount++;

    } catch (error) {
      console.log(`❌ Failed to fund ${walletConfig.name.toUpperCase()}:`, error);
    }
  }

  // Fund test tokens
  console.log("\n🪙 Funding test tokens...");
  
  // Load deployment to get test token addresses
  let mockUSDTAddress: string;
  let mockDAIAddress: string;
  try {
    const deploymentData = fs.readFileSync("deployments.json", "utf-8");
    const deployments = JSON.parse(deploymentData);
    mockUSDTAddress = deployments.osmosis?.MockUSDT;
    mockDAIAddress = deployments.osmosis?.MockDAI;
    
    if (!mockUSDTAddress || !mockDAIAddress) {
      console.log("❌ Token addresses not found in deployments.json");
      console.log("Run deploy-all script first");
      return;
    }
  } catch (error) {
    console.log("❌ Could not load deployments.json");
    console.log("Run deploy-all script first");
    return;
  }

  console.log(`MockUSDT address: ${mockUSDTAddress}`);
  console.log(`MockDAI address: ${mockDAIAddress}`);

  // Mint test tokens to each wallet
  for (const walletConfig of walletsToFund) {
    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(walletConfig.mnemonic!, { prefix: "osmo" });
      const [account] = await wallet.getAccounts();
      
      console.log(`\n🪙 Minting tokens for ${walletConfig.name.toUpperCase()}`);
      
      const mintMsg = {
        mint: {
          recipient: account.address,
          amount: walletConfig.tokenAmount,
        },
      };

      // Mint MockUSDT
      const mintUSDTResult = await client.execute(
        deployerAccount.address,
        mockUSDTAddress,
        mintMsg,
        "auto",
        `Minting USDT for ${walletConfig.name}`
      );
      console.log(`✅ Minted ${(parseInt(walletConfig.tokenAmount) / 1_000_000).toFixed(2)} MockUSDT (tx: ${mintUSDTResult.transactionHash})`);

      // Mint MockDAI
      const mintDAIResult = await client.execute(
        deployerAccount.address,
        mockDAIAddress,
        mintMsg,
        "auto",
        `Minting DAI for ${walletConfig.name}`
      );
      console.log(`✅ Minted ${(parseInt(walletConfig.tokenAmount) / 1_000_000).toFixed(2)} MockDAI (tx: ${mintDAIResult.transactionHash})`);

    } catch (error) {
      console.log(`❌ Failed to mint tokens for ${walletConfig.name.toUpperCase()}:`, error);
    }
  }

  console.log("\n✅ FUNDING COMPLETE");
  console.log(`Successfully funded: ${successCount}/${walletsToFund.length} wallets`);
  console.log(`OSMO per wallet: ${(parseInt(osmoAmount) / 1_000_000).toFixed(2)} OSMO`);
  console.log(`Tokens per wallet: ${(parseInt(tokenAmount) / 1_000_000).toFixed(2)} TUSDT`);
  console.log(`Total OSMO sent: ${(successCount * parseInt(osmoAmount) / 1_000_000).toFixed(2)} OSMO`);
  
  console.log("\n🔗 View transactions on: https://testnet.mintscan.io/osmosis-testnet");
  console.log("💰 Get more testnet OSMO: https://faucet.testnet.osmosis.zone/");
}

// Usage examples:
// FUND_TARGETS="all" npm run fund:all
// FUND_TARGETS="user,resolver0" FUND_AMOUNT="10000000" npm run fund:all  
// FUND_TARGETS="resolver1" TOKEN_AMOUNT="5000000000" npm run fund:all

fundAll().catch(console.error);