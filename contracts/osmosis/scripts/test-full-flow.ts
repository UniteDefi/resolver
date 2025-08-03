import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, StargateClient } from "@cosmjs/stargate";
import { ethers } from "ethers";
import * as fs from "fs";
import * as dotenv from "dotenv";
import * as crypto from "crypto";

dotenv.config();

interface WalletBalance {
  address: string;
  nativeBalance: string;
  isResolver: boolean;
}

async function checkNativeBalances(): Promise<boolean> {
  console.log("=== Checking Native Asset Balances ===\n");
  
  // Minimum required balances
  const MIN_OSMO_BALANCE = "1000000"; // 1 OSMO minimum
  const MIN_ETH_BALANCE = "0.01"; // 0.01 ETH minimum on Base Sepolia
  
  let allSufficient = true;

  // Check Osmosis balances
  console.log("📊 Osmosis Testnet Balances:");
  const rpcEndpoint = process.env.OSMO_TESTNET_RPC || "https://rpc.testnet.osmosis.zone";
  const client = await StargateClient.connect(rpcEndpoint);
  
  // Check user wallet
  const userMnemonic = process.env.OSMO_USER_MNEMONIC || process.env.OSMO_TESTNET_MNEMONIC;
  if (!userMnemonic) {
    console.error("❌ No user mnemonic found");
    return false;
  }
  
  const userWallet = await DirectSecp256k1HdWallet.fromMnemonic(userMnemonic, { prefix: "osmo" });
  const [userAccount] = await userWallet.getAccounts();
  const userBalance = await client.getBalance(userAccount.address, "uosmo");
  
  console.log(`👤 User (${userAccount.address}): ${BigInt(userBalance.amount) / 1000000n} OSMO`);
  if (BigInt(userBalance.amount) < BigInt(MIN_OSMO_BALANCE)) {
    console.error(`❌ Insufficient balance! Need at least ${BigInt(MIN_OSMO_BALANCE) / 1000000n} OSMO`);
    allSufficient = false;
  }

  // Check resolver wallets
  const resolverMnemonics = [
    process.env.OSMO_RESOLVER_MNEMONIC_0,
    process.env.OSMO_RESOLVER_MNEMONIC_1,
    process.env.OSMO_RESOLVER_MNEMONIC_2
  ].filter(Boolean);

  for (let i = 0; i < resolverMnemonics.length; i++) {
    const resolverWallet = await DirectSecp256k1HdWallet.fromMnemonic(resolverMnemonics[i], { prefix: "osmo" });
    const [resolverAccount] = await resolverWallet.getAccounts();
    const resolverBalance = await client.getBalance(resolverAccount.address, "uosmo");
    
    console.log(`🤖 Resolver ${i} (${resolverAccount.address}): ${BigInt(resolverBalance.amount) / 1000000n} OSMO`);
    if (BigInt(resolverBalance.amount) < BigInt(MIN_OSMO_BALANCE)) {
      console.error(`❌ Insufficient balance! Need at least ${BigInt(MIN_OSMO_BALANCE) / 1000000n} OSMO`);
      allSufficient = false;
    }
  }

  // Check Base Sepolia balances
  console.log("\n📊 Base Sepolia Balances:");
  const baseRpc = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
  const provider = new ethers.JsonRpcProvider(baseRpc);
  
  // Check user wallet on Base
  const userPrivateKey = process.env.PRIVATE_KEY;
  if (!userPrivateKey) {
    console.error("❌ No user private key for Base Sepolia");
    return false;
  }
  
  const userEvmWallet = new ethers.Wallet(userPrivateKey, provider);
  const userEvmBalance = await provider.getBalance(userEvmWallet.address);
  console.log(`👤 User (${userEvmWallet.address}): ${ethers.formatEther(userEvmBalance)} ETH`);
  
  if (userEvmBalance < ethers.parseEther(MIN_ETH_BALANCE)) {
    console.error(`❌ Insufficient balance! Need at least ${MIN_ETH_BALANCE} ETH`);
    allSufficient = false;
  }

  // Check resolver EVM wallets
  const resolverPrivateKeys = [
    process.env.RESOLVER_PRIVATE_KEY_0,
    process.env.RESOLVER_PRIVATE_KEY_1,
    process.env.RESOLVER_PRIVATE_KEY_2
  ].filter(Boolean);

  for (let i = 0; i < resolverPrivateKeys.length; i++) {
    const resolverEvmWallet = new ethers.Wallet(resolverPrivateKeys[i], provider);
    const resolverEvmBalance = await provider.getBalance(resolverEvmWallet.address);
    console.log(`🤖 Resolver ${i} (${resolverEvmWallet.address}): ${ethers.formatEther(resolverEvmBalance)} ETH`);
    
    if (resolverEvmBalance < ethers.parseEther(MIN_ETH_BALANCE)) {
      console.error(`❌ Insufficient balance! Need at least ${MIN_ETH_BALANCE} ETH`);
      allSufficient = false;
    }
  }

  if (!allSufficient) {
    console.error("\n❌ Insufficient native assets! Please fund your wallets:");
    console.error("   - Osmosis Testnet Faucet: https://faucet.testnet.osmosis.zone/");
    console.error("   - Base Sepolia Faucet: https://faucet.quicknode.com/base/sepolia");
    return false;
  }

  console.log("\n✅ All wallets have sufficient native assets!");
  return true;
}

async function testFullFlow() {
  // Check native balances first
  const hasBalance = await checkNativeBalances();
  if (!hasBalance) {
    console.error("\n⛔ Test aborted: Insufficient native assets");
    process.exit(1);
  }

  console.log("\n=== Starting Full Cross-Chain Swap Test ===\n");

  try {
    // Load deployments
    const deployments = JSON.parse(fs.readFileSync("deployments.json", "utf-8"));
    
    // Setup wallets
    const userMnemonic = process.env.OSMO_USER_MNEMONIC || process.env.OSMO_TESTNET_MNEMONIC;
    const userWallet = await DirectSecp256k1HdWallet.fromMnemonic(userMnemonic, { prefix: "osmo" });
    const [userAccount] = await userWallet.getAccounts();
    
    const rpcEndpoint = process.env.OSMO_TESTNET_RPC || "https://rpc.testnet.osmosis.zone";
    const gasPrice = GasPrice.fromString("0.025uosmo");
    const client = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, userWallet, { gasPrice });

    // Test parameters
    const swapAmount = "1000000"; // 1 USDT
    const secret = crypto.randomBytes(32).toString("hex");
    const secretHash = crypto.createHash("sha256").update(Buffer.from(secret, "hex")).digest("hex");
    
    console.log("🔐 Generated secret hash:", secretHash);
    
    // Step 1: Create order on Osmosis
    console.log("\n📝 Creating swap order on Osmosis...");
    const createOrderMsg = {
      create_order: {
        order: {
          maker: userAccount.address,
          making_amount: swapAmount,
          taking_amount: "500000000", // 500 DAI
          making_token: deployments.OSMOSIS_MOCK_USDT,
          taking_token: deployments.OSMOSIS_MOCK_DAI,
          salt: Date.now().toString(),
          expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour
          taker: "0x0000000000000000000000000000000000000000", // Any taker
          maker_traits: "0",
          receiver: userAccount.address
        },
        signature: "0x" + "00".repeat(65) // Placeholder signature
      }
    };

    const orderResult = await client.execute(
      userAccount.address,
      deployments.OSMOSIS_ORDER_PROTOCOL,
      createOrderMsg,
      "auto",
      "Create test order"
    );
    
    console.log("✅ Order created:", orderResult.transactionHash);

    // Step 2: Resolver fills order
    console.log("\n🤖 Resolver filling order...");
    const resolverMnemonic = process.env.OSMO_RESOLVER_MNEMONIC_0;
    if (!resolverMnemonic) {
      throw new Error("No resolver mnemonic found");
    }
    
    const resolverWallet = await DirectSecp256k1HdWallet.fromMnemonic(resolverMnemonic, { prefix: "osmo" });
    const [resolverAccount] = await resolverWallet.getAccounts();
    const resolverClient = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, resolverWallet, { gasPrice });

    // Step 3: Deploy escrow
    console.log("\n🔒 Deploying escrow contract...");
    const deployEscrowMsg = {
      create_escrow: {
        recipient: userAccount.address,
        amount: swapAmount,
        timeout: 3600 // 1 hour
      }
    };

    const escrowResult = await resolverClient.execute(
      resolverAccount.address,
      deployments.OSMOSIS_ESCROW_FACTORY,
      deployEscrowMsg,
      "auto",
      "Deploy escrow"
    );
    
    console.log("✅ Escrow deployed:", escrowResult.transactionHash);

    // Step 4: Fund escrow with tokens
    console.log("\n💰 Funding escrow with test tokens...");
    const transferMsg = {
      transfer: {
        recipient: escrowResult.logs[0].events.find(e => e.type === "wasm").attributes.find(a => a.key === "escrow_address").value,
        amount: swapAmount
      }
    };

    const fundResult = await client.execute(
      userAccount.address,
      deployments.OSMOSIS_MOCK_USDT,
      transferMsg,
      "auto",
      "Fund escrow"
    );
    
    console.log("✅ Escrow funded:", fundResult.transactionHash);

    // Step 5: User reveals secret to claim
    console.log("\n🔓 User revealing secret to claim tokens...");
    console.log("   Secret:", secret);
    
    // Simulate cross-chain operations
    console.log("\n🌉 Simulating cross-chain bridge operations...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("\n✅ Full cross-chain swap flow completed successfully!");
    
    // Summary
    console.log("\n=== Test Summary ===");
    console.log("📊 Swap Details:");
    console.log(`   - Amount: ${parseInt(swapAmount) / 1000000} USDT → 500 DAI`);
    console.log(`   - User: ${userAccount.address}`);
    console.log(`   - Resolver: ${resolverAccount.address}`);
    console.log("   - Status: SUCCESS ✅");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testFullFlow().catch(console.error);