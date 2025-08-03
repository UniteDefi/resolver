import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { Transaction } from "@mysten/sui.js/transactions";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import * as crypto from "crypto";

dotenv.config();

interface DeploymentInfo {
  packageId: string;
  escrowFactoryId: string;
  limitOrderProtocolId: string;
  mockUSDTTreasuryCapId: string;
  mockDAITreasuryCapId: string;
  deployerAddress: string;
}

interface TestUser {
  name: string;
  keypair: Ed25519Keypair;
  address: string;
}

interface OrderData {
  salt: string;
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  deadline: string;
  nonce: string;
  srcChainId: string;
  dstChainId: string;
  auctionStartTime: string;
  auctionEndTime: string;
  startPrice: string;
  endPrice: string;
}

describe("Cross-Chain Flow V2 Tests", () => {
  let client: SuiClient;
  let deployment: DeploymentInfo;
  let deployer: TestUser;
  let testUser: TestUser;
  let resolver0: TestUser;
  let resolver1: TestUser;
  
  const secret = crypto.randomBytes(32);
  const hashlock = crypto.createHash("sha256").update(secret).digest();
  
  before(async () => {
    // Load deployment info
    const deploymentPath = path.join(__dirname, "..", "deployments_v2.json");
    if (!fs.existsSync(deploymentPath)) {
      throw new Error("Deployment file not found. Run deploy_v2.ts first.");
    }
    
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    
    // Setup client
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("testnet");
    client = new SuiClient({ url: rpcUrl });
    
    // Setup test users
    deployer = {
      name: "Deployer",
      keypair: Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PRIVATE_KEY!, "hex")),
      address: "",
    };
    deployer.address = deployer.keypair.getPublicKey().toSuiAddress();
    
    testUser = {
      name: "Test User",
      keypair: Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_TEST_USER_PRIVATE_KEY!, "hex")),
      address: "",
    };
    testUser.address = testUser.keypair.getPublicKey().toSuiAddress();
    
    resolver0 = {
      name: "Resolver 0",
      keypair: Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_0!, "hex")),
      address: "",
    };
    resolver0.address = resolver0.keypair.getPublicKey().toSuiAddress();
    
    resolver1 = {
      name: "Resolver 1", 
      keypair: Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_1!, "hex")),
      address: "",
    };
    resolver1.address = resolver1.keypair.getPublicKey().toSuiAddress();
    
    console.log("🧪 Test Setup Complete");
    console.log("📦 Package ID:", deployment.packageId);
    console.log("👤 Test User:", testUser.address);
    console.log("🔄 Resolver 0:", resolver0.address);
    console.log("🔄 Resolver 1:", resolver1.address);
    console.log("🔐 Secret (hex):", secret.toString("hex"));
    console.log("🔒 Hashlock (hex):", hashlock.toString("hex"));
  });
  
  it("should verify deployment and initial balances", async () => {
    // Check that main objects exist
    const factory = await client.getObject({
      id: deployment.escrowFactoryId,
      options: { showContent: true },
    });
    expect(factory.data).to.exist;
    
    const protocol = await client.getObject({
      id: deployment.limitOrderProtocolId,
      options: { showContent: true },
    });
    expect(protocol.data).to.exist;
    
    // Check user balances
    const userBalance = await client.getBalance({ owner: testUser.address });
    const resolver0Balance = await client.getBalance({ owner: resolver0.address });
    const resolver1Balance = await client.getBalance({ owner: resolver1.address });
    
    console.log("💰 User SUI balance:", Number(userBalance.totalBalance) / 1e9);
    console.log("💰 Resolver 0 SUI balance:", Number(resolver0Balance.totalBalance) / 1e9);
    console.log("💰 Resolver 1 SUI balance:", Number(resolver1Balance.totalBalance) / 1e9);
    
    expect(Number(userBalance.totalBalance)).to.be.greaterThan(0);
    expect(Number(resolver0Balance.totalBalance)).to.be.greaterThan(0);
    expect(Number(resolver1Balance.totalBalance)).to.be.greaterThan(0);
  });
  
  it("should check token balances", async () => {
    // Get user's USDT and DAI coins
    const userCoins = await client.getCoins({
      owner: testUser.address,
      coinType: `${deployment.packageId}::mock_usdt::MOCK_USDT`,
    });
    
    const userDaiCoins = await client.getCoins({
      owner: testUser.address,
      coinType: `${deployment.packageId}::mock_dai::MOCK_DAI`,
    });
    
    expect(userCoins.data.length).to.be.greaterThan(0);
    expect(userDaiCoins.data.length).to.be.greaterThan(0);
    
    const totalUSDT = userCoins.data.reduce((sum, coin) => sum + Number(coin.balance), 0);
    const totalDAI = userDaiCoins.data.reduce((sum, coin) => sum + Number(coin.balance), 0);
    
    console.log("💰 User USDT balance:", totalUSDT / 1e6);
    console.log("💰 User DAI balance:", totalDAI / 1e18);
    
    expect(totalUSDT).to.be.greaterThan(0);
    expect(totalDAI).to.be.greaterThan(0);
  });
  
  it("should create and execute a cross-chain swap order", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const auctionDuration = 3600; // 1 hour
    
    // Create order data for USDT -> DAI swap
    const orderData: OrderData = {
      salt: "12345",
      maker: testUser.address,
      receiver: testUser.address,
      makerAsset: `${deployment.packageId}::mock_usdt::MOCK_USDT`,
      takerAsset: `${deployment.packageId}::mock_dai::MOCK_DAI`,
      makingAmount: (1000 * 1e6).toString(), // 1000 USDT (6 decimals)
      takingAmount: (1000 * 1e18).toString(), // 1000 DAI (18 decimals)
      deadline: (currentTime + 7200).toString(), // 2 hours from now
      nonce: "1",
      srcChainId: "1", // Ethereum
      dstChainId: "101", // Sui (placeholder)
      auctionStartTime: currentTime.toString(),
      auctionEndTime: (currentTime + auctionDuration).toString(),
      startPrice: (1.05 * 1e18).toString(), // 1.05 (18 decimals) - starting at premium
      endPrice: (0.98 * 1e18).toString(), // 0.98 - ending at discount
    };
    
    console.log("📝 Creating order with:");
    console.log("  Making Amount:", orderData.makingAmount, "USDT (raw)");
    console.log("  Taking Amount:", orderData.takingAmount, "DAI (raw)");
    console.log("  Start Price:", Number(orderData.startPrice) / 1e18);
    console.log("  End Price:", Number(orderData.endPrice) / 1e18);
    
    // Create order hash
    const orderHash = await createOrderHash(orderData);
    console.log("🔗 Order Hash:", orderHash);
    
    // Step 1: Resolver 0 fills partial amount on source chain (simulated)
    const partialAmount1 = (500 * 1e6); // 500 USDT
    const safetyDeposit = BigInt(0.1 * 1e9); // 0.1 SUI safety deposit
    
    const srcTx1 = new Transaction();
    
    // Create immutables for source escrow
    const srcImmutables = {
      order_hash: Array.from(Buffer.from(orderHash.slice(2), "hex")),
      hashlock: Array.from(hashlock),
      maker: testUser.address,
      taker: "0x0000000000000000000000000000000000000000000000000000000000000000",
      token: orderData.makerAsset,
      amount: orderData.makingAmount,
      safety_deposit: safetyDeposit.toString(),
      timelocks: "0", // Will be encoded properly in contract
    };
    
    const [srcCoin] = srcTx1.splitCoins(srcTx1.gas, [safetyDeposit]);
    
    const [srcEscrowId] = srcTx1.moveCall({
      target: `${deployment.packageId}::escrow_factory_v2::create_src_escrow_partial_for`,
      arguments: [
        srcTx1.object(deployment.escrowFactoryId),
        srcTx1.pure.vector("u8", srcImmutables.order_hash),
        srcTx1.pure.vector("u8", srcImmutables.hashlock),
        srcTx1.pure.address(srcImmutables.maker),
        srcTx1.pure.address(srcImmutables.taker),
        srcTx1.pure.address(srcImmutables.token),
        srcTx1.pure.u256(srcImmutables.amount),
        srcTx1.pure.u256(srcImmutables.safety_deposit),
        srcTx1.pure.u256(srcImmutables.timelocks),
        srcTx1.pure.u64(partialAmount1),
        srcTx1.pure.address(resolver0.address),
        srcCoin,
      ],
      typeArguments: [`${deployment.packageId}::mock_usdt::MOCK_USDT`],
    });
    
    const srcResult1 = await client.signAndExecuteTransaction({
      signer: resolver0.keypair,
      transaction: srcTx1,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    expect(srcResult1.effects?.status?.status).to.equal("success");
    console.log("✅ Source escrow created by Resolver 0");
    console.log("📄 Tx:", srcResult1.digest);
    
    // Step 2: Resolver 1 fills remaining amount on source chain
    const partialAmount2 = (500 * 1e6); // 500 USDT
    
    const srcTx2 = new Transaction();
    const [srcCoin2] = srcTx2.splitCoins(srcTx2.gas, [safetyDeposit]);
    
    srcTx2.moveCall({
      target: `${deployment.packageId}::escrow_factory_v2::create_src_escrow_partial_for`,
      arguments: [
        srcTx2.object(deployment.escrowFactoryId),
        srcTx2.pure.vector("u8", srcImmutables.order_hash),
        srcTx2.pure.vector("u8", srcImmutables.hashlock),
        srcTx2.pure.address(srcImmutables.maker),
        srcTx2.pure.address(srcImmutables.taker),
        srcTx2.pure.address(srcImmutables.token),
        srcTx2.pure.u256(srcImmutables.amount),
        srcTx2.pure.u256(srcImmutables.safety_deposit),
        srcTx2.pure.u256(srcImmutables.timelocks),
        srcTx2.pure.u64(partialAmount2),
        srcTx2.pure.address(resolver1.address),
        srcCoin2,
      ],
      typeArguments: [`${deployment.packageId}::mock_usdt::MOCK_USDT`],
    });
    
    const srcResult2 = await client.signAndExecuteTransaction({
      signer: resolver1.keypair,
      transaction: srcTx2,
      options: {
        showEffects: true,
      },
    });
    
    expect(srcResult2.effects?.status?.status).to.equal("success");
    console.log("✅ Resolver 1 added to source escrow");
    console.log("📄 Tx:", srcResult2.digest);
    
    // Step 3: Create destination escrows with Dutch auction pricing
    const currentAuctionTime = Math.floor(Date.now() / 1000);
    const timeElapsed = currentAuctionTime - currentTime;
    const auctionProgress = Math.min(timeElapsed / auctionDuration, 1);
    
    // Calculate current price (linear decay)
    const startPrice = Number(orderData.startPrice) / 1e18;
    const endPrice = Number(orderData.endPrice) / 1e18;
    const currentPrice = startPrice - (startPrice - endPrice) * auctionProgress;
    
    console.log("🕐 Auction Progress:", (auctionProgress * 100).toFixed(2) + "%");
    console.log("💱 Current Price:", currentPrice.toFixed(6));
    
    // Calculate destination amounts for each resolver
    const destAmount1 = Math.floor((partialAmount1 / 1e6) * currentPrice * 1e18); // Convert to DAI
    const destAmount2 = Math.floor((partialAmount2 / 1e6) * currentPrice * 1e18);
    
    console.log("🎯 Dest Amount 1:", destAmount1 / 1e18, "DAI");
    console.log("🎯 Dest Amount 2:", destAmount2 / 1e18, "DAI");
    
    // Resolver 0 creates destination escrow
    const dstTx1 = new Transaction();
    
    // Get DAI coins for resolver 0
    const resolver0DaiCoins = await client.getCoins({
      owner: resolver0.address,
      coinType: `${deployment.packageId}::mock_dai::MOCK_DAI`,
    });
    
    expect(resolver0DaiCoins.data.length).to.be.greaterThan(0);
    
    const daiCoin1 = resolver0DaiCoins.data[0].coinObjectId;
    const [dstSafetyCoin1] = dstTx1.splitCoins(dstTx1.gas, [safetyDeposit]);
    
    // Create destination immutables
    const dstImmutables = {
      order_hash: Array.from(Buffer.from(orderHash.slice(2), "hex")),
      hashlock: Array.from(hashlock),
      maker: testUser.address,
      taker: "0x0000000000000000000000000000000000000000000000000000000000000000",
      token: orderData.takerAsset,
      amount: orderData.takingAmount,
      safety_deposit: safetyDeposit.toString(),
      timelocks: "0",
    };
    
    dstTx1.moveCall({
      target: `${deployment.packageId}::escrow_factory_v2::create_dst_escrow_partial_for`,
      arguments: [
        dstTx1.object(deployment.escrowFactoryId),
        dstTx1.pure.vector("u8", dstImmutables.order_hash),
        dstTx1.pure.vector("u8", dstImmutables.hashlock),
        dstTx1.pure.address(dstImmutables.maker),
        dstTx1.pure.address(dstImmutables.taker),
        dstTx1.pure.address(dstImmutables.token),
        dstTx1.pure.u256(dstImmutables.amount),
        dstTx1.pure.u256(dstImmutables.safety_deposit),
        dstTx1.pure.u256(dstImmutables.timelocks),
        dstTx1.pure.u64(currentTime), // src cancellation timestamp
        dstTx1.pure.u64(destAmount1),
        dstTx1.pure.address(resolver0.address),
        dstSafetyCoin1,
      ],
      typeArguments: [`${deployment.packageId}::mock_dai::MOCK_DAI`],
    });
    
    const dstResult1 = await client.signAndExecuteTransaction({
      signer: resolver0.keypair,
      transaction: dstTx1,
      options: {
        showEffects: true,
      },
    });
    
    expect(dstResult1.effects?.status?.status).to.equal("success");
    console.log("✅ Destination escrow created by Resolver 0");
    console.log("📄 Tx:", dstResult1.digest);
    
    // Similarly for Resolver 1
    const dstTx2 = new Transaction();
    
    const resolver1DaiCoins = await client.getCoins({
      owner: resolver1.address,
      coinType: `${deployment.packageId}::mock_dai::MOCK_DAI`,
    });
    
    expect(resolver1DaiCoins.data.length).to.be.greaterThan(0);
    
    const [dstSafetyCoin2] = dstTx2.splitCoins(dstTx2.gas, [safetyDeposit]);
    
    dstTx2.moveCall({
      target: `${deployment.packageId}::escrow_factory_v2::create_dst_escrow_partial_for`,
      arguments: [
        dstTx2.object(deployment.escrowFactoryId),
        dstTx2.pure.vector("u8", dstImmutables.order_hash),
        dstTx2.pure.vector("u8", dstImmutables.hashlock),
        dstTx2.pure.address(dstImmutables.maker),
        dstTx2.pure.address(dstImmutables.taker),
        dstTx2.pure.address(dstImmutables.token),
        dstTx2.pure.u256(dstImmutables.amount),
        dstTx2.pure.u256(dstImmutables.safety_deposit),
        dstTx2.pure.u256(dstImmutables.timelocks),
        dstTx2.pure.u64(currentTime), // src cancellation timestamp
        dstTx2.pure.u64(destAmount2),
        dstTx2.pure.address(resolver1.address),
        dstSafetyCoin2,
      ],
      typeArguments: [`${deployment.packageId}::mock_dai::MOCK_DAI`],
    });
    
    const dstResult2 = await client.signAndExecuteTransaction({
      signer: resolver1.keypair,
      transaction: dstTx2,
      options: {
        showEffects: true,
      },
    });
    
    expect(dstResult2.effects?.status?.status).to.equal("success");
    console.log("✅ Destination escrow created by Resolver 1");
    console.log("📄 Tx:", dstResult2.digest);
    
    console.log("🎉 Cross-chain swap order executed successfully!");
    console.log("📊 Summary:");
    console.log(`  Source: ${partialAmount1 / 1e6 + partialAmount2 / 1e6} USDT`);
    console.log(`  Destination: ${(destAmount1 + destAmount2) / 1e18} DAI`);
    console.log(`  Effective Rate: ${((destAmount1 + destAmount2) / 1e18) / ((partialAmount1 + partialAmount2) / 1e6)}`);
  });
  
  after(async () => {
    console.log("🧹 Test cleanup completed");
  });
});

// Helper function to create order hash (simplified version)
async function createOrderHash(orderData: OrderData): Promise<string> {
  // This is a simplified version - in production, this should match the EVM implementation exactly
  const data = [
    orderData.salt,
    orderData.maker,
    orderData.receiver,
    orderData.makerAsset,
    orderData.takerAsset,
    orderData.makingAmount,
    orderData.takingAmount,
    orderData.deadline,
    orderData.nonce,
    orderData.srcChainId,
    orderData.dstChainId,
    orderData.auctionStartTime,
    orderData.auctionEndTime,
    orderData.startPrice,
    orderData.endPrice,
  ].join("");
  
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  return "0x" + hash;
}