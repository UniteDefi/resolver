import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Complete transaction tracking
const allTransactions: any[] = [];

function logTx(actor: string, chain: string, action: string, tx: any, details?: any) {
  const entry = {
    actor,
    chain,
    action,
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    timestamp: new Date().toISOString(),
    ...details
  };
  allTransactions.push(entry);
  console.log(`[${chain}] ${actor} - ${action}: ${tx.hash}`);
}

async function main() {
  console.log("\n🔬 === Cross-Chain Atomic Swap (Direct Escrow Implementation) ===");
  console.log("100 USDC (Ethereum) → 97 USDC (Base) with HTLC\n");

  // Load deployments
  const escrowDeployments = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "escrow_deployments.json"), "utf8")
  );
  const tokenDeployments = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "crosschain_deployments.json"), "utf8")
  );

  // Setup providers
  const ethProvider = new ethers.JsonRpcProvider(
    `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );
  const baseProvider = new ethers.JsonRpcProvider(
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Setup wallets
  const user = new ethers.Wallet(process.env.SELLER_WALLET_PRIVATE_KEY!, ethProvider);
  const resolver = new ethers.Wallet(process.env.RESOLVER1_WALLET_PRIVATE_KEY!, ethProvider);

  console.log("👥 Participants:");
  console.log(`  User: ${user.address}`);
  console.log(`  Resolver: ${resolver.address}\n`);

  // Load ABIs
  const tokenAbi = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "dist/contracts/MockToken.sol/MockToken.json"), "utf8")
  ).abi;

  const escrowFactoryAbi = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "dist/contracts/TestEscrowFactory.sol/TestEscrowFactory.json"), "utf8")
  ).abi;

  // Get escrow ABIs
  const escrowSrcAbi = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "contracts/lib/cross-chain-swap/out/EscrowSrc.sol/EscrowSrc.json"), "utf8")
  ).abi;

  const escrowDstAbi = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "contracts/lib/cross-chain-swap/out/EscrowDst.sol/EscrowDst.json"), "utf8")
  ).abi;

  // Contract instances
  const ethUsdc = new ethers.Contract(tokenDeployments.ethereum_sepolia.mockUSDT, tokenAbi, user);
  const baseUsdc = new ethers.Contract(tokenDeployments.base_sepolia.mockUSDT, tokenAbi, resolver.connect(baseProvider));
  
  // Escrow factories
  const ethEscrowFactory = new ethers.Contract(escrowDeployments.ethereum_sepolia.escrowFactory, escrowFactoryAbi, resolver);
  const baseEscrowFactory = new ethers.Contract(escrowDeployments.base_sepolia.escrowFactory, escrowFactoryAbi, resolver.connect(baseProvider));

  // Generate HTLC secret
  const secret = ethers.randomBytes(32);
  const hashlock = ethers.keccak256(secret);
  console.log("🔐 HTLC Setup:");
  console.log(`  Secret: ${ethers.hexlify(secret).slice(0, 20)}...`);
  console.log(`  Hashlock: ${hashlock.slice(0, 20)}...\n`);

  // Check balances
  console.log("💰 Initial Balances:");
  const userEthUsdc = await ethUsdc.balanceOf(user.address);
  const userBaseUsdc = await baseUsdc.balanceOf(user.address);
  const resolverEthUsdc = await ethUsdc.connect(ethProvider).balanceOf(resolver.address);
  const resolverBaseUsdc = await baseUsdc.balanceOf(resolver.address);
  console.log(`  User: ${ethers.formatUnits(userEthUsdc, 6)} USDC (ETH), ${ethers.formatUnits(userBaseUsdc, 6)} USDC (Base)`);
  console.log(`  Resolver: ${ethers.formatUnits(resolverEthUsdc, 6)} USDC (ETH), ${ethers.formatUnits(resolverBaseUsdc, 6)} USDC (Base)\n`);

  // Step 1: Create source escrow on Ethereum
  console.log("🏗️ Step 1: Creating source escrow on Ethereum");
  
  const currentTime = Math.floor(Date.now() / 1000);
  const orderHash = ethers.keccak256(ethers.toUtf8Bytes(`order_${currentTime}`));
  
  // Immutables for source escrow
  const srcImmutables = {
    orderHash: orderHash,
    hashlock: hashlock,
    maker: user.address,
    taker: resolver.address,
    token: ethUsdc.target,
    amount: ethers.parseUnits("100", 6),
    safetyDeposit: ethers.parseEther("0.001"),
    timelocks: {
      deployedAt: currentTime,
      srcWithdrawal: currentTime + 10,
      srcPublicWithdrawal: currentTime + 120,
      srcCancellation: currentTime + 180,
      srcPublicCancellation: currentTime + 240,
      dstWithdrawal: currentTime + 10,
      dstPublicWithdrawal: currentTime + 100,
      dstCancellation: currentTime + 160
    }
  };

  // User transfers tokens to escrow factory
  console.log("  Transferring 100 USDC to escrow factory...");
  const transferToFactoryTx = await ethUsdc.transfer(ethEscrowFactory.target, ethers.parseUnits("100", 6));
  await transferToFactoryTx.wait();
  logTx("User", "Ethereum", "Transfer to factory", transferToFactoryTx, {
    amount: "100 USDC",
    recipient: ethEscrowFactory.target
  });

  // Create source escrow
  const createSrcTx = await ethEscrowFactory.createSrcEscrow(
    srcImmutables,
    { value: ethers.parseEther("0.001") }
  );
  await createSrcTx.wait();
  logTx("Resolver", "Ethereum", "Create source escrow", createSrcTx, {
    safetyDeposit: "0.001 ETH",
    amount: "100 USDC locked"
  });

  const srcEscrowAddress = await ethEscrowFactory.addressOfEscrowSrc(srcImmutables);
  console.log(`  ✅ Source escrow created at: ${srcEscrowAddress}\n`);

  // Step 2: Create destination escrow on Base  
  console.log("💸 Step 2: Creating destination escrow on Base");
  
  // Immutables for destination escrow
  const dstImmutables = {
    orderHash: orderHash,
    hashlock: hashlock,
    maker: resolver.address,
    taker: user.address,
    token: baseUsdc.target,
    amount: ethers.parseUnits("97", 6),
    safetyDeposit: ethers.parseEther("0.001"),
    timelocks: srcImmutables.timelocks
  };

  // Resolver transfers tokens to escrow factory
  const transferToDstFactoryTx = await baseUsdc.transfer(baseEscrowFactory.target, ethers.parseUnits("97", 6));
  await transferToDstFactoryTx.wait();
  logTx("Resolver", "Base", "Transfer to factory", transferToDstFactoryTx, {
    amount: "97 USDC",
    recipient: baseEscrowFactory.target
  });

  // Create destination escrow
  const createDstTx = await baseEscrowFactory.createDstEscrow(
    dstImmutables,
    currentTime + 180, // srcCancellationTimestamp
    { value: ethers.parseEther("0.001") }
  );
  await createDstTx.wait();
  logTx("Resolver", "Base", "Create destination escrow", createDstTx, {
    safetyDeposit: "0.001 ETH",
    amount: "97 USDC locked"
  });

  const dstEscrowAddress = await baseEscrowFactory.addressOfEscrowDst(dstImmutables);
  console.log(`  ✅ Destination escrow created at: ${dstEscrowAddress}\n`);

  // Step 3: User reveals secret on destination
  console.log("🔓 Step 3: User reveals secret on Base to claim USDC");
  
  const escrowDst = new ethers.Contract(dstEscrowAddress, escrowDstAbi, user.connect(baseProvider));
  
  console.log("  Waiting 10 seconds for finality period...");
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  const withdrawDstTx = await escrowDst.withdraw(secret, dstImmutables);
  await withdrawDstTx.wait();
  logTx("User", "Base", "Withdraw with secret", withdrawDstTx, {
    escrow: dstEscrowAddress,
    amount: "97 USDC claimed"
  });
  console.log(`  ✅ User claimed 97 USDC on Base\n`);

  // Step 4: Resolver uses secret to claim on source
  console.log("💰 Step 4: Resolver claims USDC on Ethereum using revealed secret");
  
  const escrowSrc = new ethers.Contract(srcEscrowAddress, escrowSrcAbi, resolver);
  
  const withdrawSrcTx = await escrowSrc.withdraw(secret, srcImmutables);
  await withdrawSrcTx.wait();
  logTx("Resolver", "Ethereum", "Withdraw with secret", withdrawSrcTx, {
    escrow: srcEscrowAddress,
    amount: "100 USDC claimed"
  });
  console.log("  ✅ Resolver claimed 100 USDC on Ethereum\n");

  // Final balances
  console.log("💰 Final Balances:");
  const userEthUsdcFinal = await ethUsdc.balanceOf(user.address);
  const userBaseUsdcFinal = await baseUsdc.balanceOf(user.address);
  const resolverEthUsdcFinal = await ethUsdc.connect(ethProvider).balanceOf(resolver.address);
  const resolverBaseUsdcFinal = await baseUsdc.balanceOf(resolver.address);
  console.log(`  User: ${ethers.formatUnits(userEthUsdcFinal, 6)} USDC (ETH), ${ethers.formatUnits(userBaseUsdcFinal, 6)} USDC (Base)`);
  console.log(`  Resolver: ${ethers.formatUnits(resolverEthUsdcFinal, 6)} USDC (ETH), ${ethers.formatUnits(resolverBaseUsdcFinal, 6)} USDC (Base)\n`);

  // Transaction report
  console.log("========== COMPLETE TRANSACTION REPORT ==========\n");
  
  allTransactions.forEach((tx, i) => {
    console.log(`${i + 1}. [${tx.chain}] ${tx.actor} - ${tx.action}`);
    console.log(`   Hash: ${tx.hash}`);
    if (tx.amount) console.log(`   Amount: ${tx.amount}`);
    if (tx.escrow) console.log(`   Escrow: ${tx.escrow}`);
    if (tx.safetyDeposit) console.log(`   Safety Deposit: ${tx.safetyDeposit}`);
    console.log();
  });

  console.log("✅ Cross-Chain Atomic Swap Complete!");
  console.log("\n📝 Summary:");
  console.log("  - User swapped 100 USDC on Ethereum for 97 USDC on Base");
  console.log("  - Resolver provided liquidity and earned 3 USDC");
  console.log("  - Funds were locked in escrows until secret reveal");
  console.log("  - HTLC ensured atomic execution");
  console.log("  - Dutch auction pricing can be added on top of this base flow");
}

main().catch(console.error);