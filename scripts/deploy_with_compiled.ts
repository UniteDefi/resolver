import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function deployWithCompiled() {
  console.log("[DeployWithCompiled] Starting deployments with compiled contracts...\n");
  
  // Load wallet
  const walletInfo = JSON.parse(fs.readFileSync(path.join(process.cwd(), "new_deployer_wallet.json"), 'utf-8'));
  const deployerPrivateKey = walletInfo.privateKey;
  const deployerWallet = new ethers.Wallet(deployerPrivateKey);
  
  console.log("Deployer Address:", deployerWallet.address);
  
  const deployments: any = {
    sepolia: {},
    baseSepolia: {},
    timestamp: new Date().toISOString()
  };
  
  try {
    // Connect to networks
    const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
    const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
    
    const sepoliaWallet = deployerWallet.connect(sepoliaProvider);
    const baseSepoliaWallet = deployerWallet.connect(baseSepoliaProvider);
    
    // Check balances
    const sepoliaBalance = await sepoliaProvider.getBalance(deployerWallet.address);
    const baseSepoliaBalance = await baseSepoliaProvider.getBalance(deployerWallet.address);
    
    console.log("Sepolia Balance:", ethers.formatEther(sepoliaBalance), "ETH");
    console.log("Base Sepolia Balance:", ethers.formatEther(baseSepoliaBalance), "ETH");
    
    // Load compiled contracts
    const relayerJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "contracts/out/RelayerContract.sol/RelayerContract.json"), 'utf-8'));
    const mockTokenJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "contracts/out/MockToken.sol/MockToken.json"), 'utf-8'));
    
    // 1. Deploy RelayerContract on Sepolia
    console.log("\n=== 1/3 Deploying RelayerContract on Sepolia ===");
    
    const relayerFactory = new ethers.ContractFactory(relayerJson.abi, relayerJson.bytecode.object, sepoliaWallet);
    console.log("Deploying RelayerContract...");
    const relayerContract = await relayerFactory.deploy();
    console.log("Transaction hash:", relayerContract.deploymentTransaction()?.hash);
    await relayerContract.waitForDeployment();
    
    deployments.sepolia.relayerContract = await relayerContract.getAddress();
    console.log("✅ RelayerContract deployed at:", deployments.sepolia.relayerContract);
    
    // 2. Deploy USDT on Sepolia
    console.log("\n=== 2/3 Deploying USDT on Sepolia ===");
    
    const usdtFactory = new ethers.ContractFactory(mockTokenJson.abi, mockTokenJson.bytecode.object, sepoliaWallet);
    console.log("Deploying USDT...");
    const usdt = await usdtFactory.deploy("Test USDT", "USDT", 6); // 6 decimals
    console.log("Transaction hash:", usdt.deploymentTransaction()?.hash);
    await usdt.waitForDeployment();
    
    deployments.sepolia.usdtToken = await usdt.getAddress();
    console.log("✅ USDT deployed at:", deployments.sepolia.usdtToken);
    
    // Mint some USDT to test addresses
    console.log("Minting USDT to test addresses...");
    const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const mintAmount = ethers.parseUnits("10000", 6); // 10,000 USDT
    
    const mintTx = await usdt.mint(deployerWallet.address, mintAmount);
    await mintTx.wait();
    console.log("✅ Minted", ethers.formatUnits(mintAmount, 6), "USDT to deployer");
    
    // 3. Deploy DAI on Base Sepolia
    console.log("\n=== 3/3 Deploying DAI on Base Sepolia ===");
    
    const daiFactory = new ethers.ContractFactory(mockTokenJson.abi, mockTokenJson.bytecode.object, baseSepoliaWallet);
    console.log("Deploying DAI...");
    const dai = await daiFactory.deploy("Test DAI", "DAI", 18); // 18 decimals
    console.log("Transaction hash:", dai.deploymentTransaction()?.hash);
    await dai.waitForDeployment();
    
    deployments.baseSepolia.daiToken = await dai.getAddress();
    console.log("✅ DAI deployed at:", deployments.baseSepolia.daiToken);
    
    // Mint some DAI
    console.log("Minting DAI to deployer...");
    const daiMintAmount = ethers.parseUnits("10000", 18); // 10,000 DAI
    const daiMintTx = await dai.mint(deployerWallet.address, daiMintAmount);
    await daiMintTx.wait();
    console.log("✅ Minted", ethers.formatUnits(daiMintAmount, 18), "DAI to deployer");
    
    // For now, use mock EscrowFactory addresses
    console.log("\n=== Using Mock EscrowFactory Addresses ===");
    deployments.sepolia.escrowFactory = "0x1234567890123456789012345678901234567890";
    deployments.baseSepolia.escrowFactory = "0x4567890123456789012345678901234567890123";
    console.log("⚠️  Note: EscrowFactory addresses are mocked for testing");
    
    // Save deployments
    const deploymentsPath = path.join(process.cwd(), "deployed_contracts.json");
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("\n✅ Deployment addresses saved to deployed_contracts.json");
    
    // Update .env file
    console.log("\n=== Updating .env file ===");
    const envPath = path.join(process.cwd(), ".env");
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Update specific env vars
    envContent = envContent.replace(/SEPOLIA_ESCROW_FACTORY=.*/g, `SEPOLIA_ESCROW_FACTORY=${deployments.sepolia.escrowFactory}`);
    envContent = envContent.replace(/BASE_SEPOLIA_ESCROW_FACTORY=.*/g, `BASE_SEPOLIA_ESCROW_FACTORY=${deployments.baseSepolia.escrowFactory}`);
    
    // Add deployed contract addresses if not already present
    if (!envContent.includes('# Deployed Contract Addresses')) {
      envContent += `
# Deployed Contract Addresses
SEPOLIA_RELAYER_CONTRACT=${deployments.sepolia.relayerContract}
SEPOLIA_USDT_TOKEN=${deployments.sepolia.usdtToken}
BASE_SEPOLIA_DAI_TOKEN=${deployments.baseSepolia.daiToken}
`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log("✅ .env file updated with deployed addresses");
    
    console.log("\n🎉 All deployments completed successfully!");
    console.log("\nDeployed contracts:");
    console.log(JSON.stringify(deployments, null, 2));
    
    console.log("\n📋 Next Steps:");
    console.log("1. Fund test wallets (user and resolver)");
    console.log("2. Transfer tokens to test wallets");
    console.log("3. Start relayer service");
    console.log("4. Start resolver service");
    console.log("5. Run cross-chain swap test");
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
  }
}

deployWithCompiled().catch(console.error);