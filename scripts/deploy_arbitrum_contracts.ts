import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function deployArbitrumContracts() {
  console.log("[Deploy] Deploying contracts to Arbitrum Sepolia...");

  // Setup provider
  const provider = new ethers.JsonRpcProvider(
    `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Setup deployer wallet
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  console.log(`[Deploy] Deployer: ${deployer.address}`);

  // Check balance
  const balance = await provider.getBalance(deployer.address);
  console.log(`[Deploy] Balance: ${ethers.formatEther(balance)} ETH`);

  // Load ABIs
  const tokenArtifact = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/MockToken.sol/MockToken.json"),
      "utf8"
    )
  );

  const auctionArtifact = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/CrossChainTokenAuction.sol/CrossChainTokenAuction.json"),
      "utf8"
    )
  );

  // Deploy USDT
  console.log("\n[Deploy] Deploying Mock USDT...");
  const USDTFactory = new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    deployer
  );
  const usdt = await USDTFactory.deploy("Mock USDT", "USDT", 6);
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log(`[Deploy] USDT deployed at: ${usdtAddress}`);

  // Deploy LINK
  console.log("\n[Deploy] Deploying Mock LINK...");
  const LINKFactory = new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    deployer
  );
  const link = await LINKFactory.deploy("Mock Chainlink", "LINK", 18);
  await link.waitForDeployment();
  const linkAddress = await link.getAddress();
  console.log(`[Deploy] LINK deployed at: ${linkAddress}`);

  // Deploy CrossChainTokenAuction
  console.log("\n[Deploy] Deploying CrossChainTokenAuction...");
  const AuctionFactory = new ethers.ContractFactory(
    auctionArtifact.abi,
    auctionArtifact.bytecode,
    deployer
  );
  const auction = await AuctionFactory.deploy();
  await auction.waitForDeployment();
  const auctionAddress = await auction.getAddress();
  console.log(`[Deploy] CrossChainTokenAuction deployed at: ${auctionAddress}`);

  // Mint tokens to test wallets
  const testWallets = [
    process.env.SELLER_WALLET_PRIVATE_KEY!,
    process.env.RESOLVER1_WALLET_PRIVATE_KEY!,
    process.env.RESOLVER2_WALLET_PRIVATE_KEY!,
    process.env.RESOLVER3_WALLET_PRIVATE_KEY!
  ].filter(Boolean).map(pk => new ethers.Wallet(pk).address);

  console.log("\n[Deploy] Minting tokens to test wallets...");
  
  // Mint USDT (10,000 USDT each)
  const usdtAmount = ethers.parseUnits("10000", 6);
  const mintUsdtTx = await usdt.mintToMultiple(testWallets, usdtAmount);
  await mintUsdtTx.wait();
  console.log("[Deploy] ✅ USDT minted to test wallets");

  // Mint LINK (100 LINK each)
  const linkAmount = ethers.parseUnits("100", 18);
  const mintLinkTx = await link.mintToMultiple(testWallets, linkAmount);
  await mintLinkTx.wait();
  console.log("[Deploy] ✅ LINK minted to test wallets");

  // Update deployments file
  const deployments = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "crosschain_deployments.json"), "utf8")
  );

  deployments.arbitrum_sepolia = {
    chain: "arbitrum_sepolia",
    chainId: 421614,
    mockUSDT: usdtAddress,
    mockLINK: linkAddress,
    crossChainTokenAuction: auctionAddress,
    testWallets: testWallets,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(process.cwd(), "crosschain_deployments.json"),
    JSON.stringify(deployments, null, 2)
  );

  // Update auction deployments
  const auctionDeployments = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "auction_deployments.json"), "utf8")
  );
  
  auctionDeployments.arbitrum_sepolia = {
    crossChainTokenAuction: auctionAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(process.cwd(), "auction_deployments.json"),
    JSON.stringify(auctionDeployments, null, 2)
  );

  console.log("\n[Deploy] ✅ All contracts deployed on Arbitrum Sepolia!");
  console.log("[Deploy] Deployments saved to crosschain_deployments.json");
}

deployArbitrumContracts().catch(console.error);