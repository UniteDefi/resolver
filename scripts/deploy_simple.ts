import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function deploySimple() {
  console.log("[DeploySimple] Starting simplified deployments...\n");
  
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
    
    // 1. Deploy RelayerContract on Sepolia
    console.log("\n=== 1/3 Deploying RelayerContract on Sepolia ===");
    
    // Simple RelayerContract bytecode
    const RELAYER_BYTECODE = "0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550610260806100606000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80638da5cb5b1461003b578063d0e30db01461006c575b600080fd5b610043610076565b60405173ffffffffffffffffffffffffffffffffffffffff909116815260200160405180910390f35b61007461009a565b005b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6000803373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003490806001815401808255809150506001900390600052602060002001600090919091909150555056fea26469706673582212207c7b2c45e1c7cf25aed3c83737be96db573cf3d3ab99b3a5e5e5a8e4a9e8b89e64736f6c63430008130033";
    
    const relayerFactory = new ethers.ContractFactory([], RELAYER_BYTECODE, sepoliaWallet);
    console.log("Deploying RelayerContract...");
    const relayerContract = await relayerFactory.deploy();
    console.log("Transaction hash:", relayerContract.deploymentTransaction()?.hash);
    await relayerContract.waitForDeployment();
    
    deployments.sepolia.relayerContract = await relayerContract.getAddress();
    console.log("✅ RelayerContract deployed at:", deployments.sepolia.relayerContract);
    
    // 2. Deploy USDT on Sepolia
    console.log("\n=== 2/3 Deploying USDT on Sepolia ===");
    
    const ERC20_BYTECODE = "0x608060405234801561001057600080fd5b5060405161094e38038061094e83398101604081905261002f91610176565b8151610042906003906020850190610069565b508051610056906004906020840190610069565b5050336000908152602081905260409020555061024f565b82805461007590610214565b90600052602060002090601f01602090048101928261009757600085556100dd565b82601f106100b057805160ff19168380011785556100dd565b828001600101855582156100dd579182015b828111156100dd5782518255916020019190600101906100c2565b506100e99291506100ed565b5090565b5b808211156100e957600081556001016100ee565b634e487b7160e01b600052604160045260246000fd5b600082601f83011261012957600080fd5b81516001600160401b038082111561014357610143610101565b604051601f8301601f19908116603f0116810190828211818310171561016b5761016b610101565b8160405283815260209250868385880101111561018757600080fd5b600091505b838210156101a9578582018301518183018401529082019061018c565b838211156101ba5760008385830101525b9695505050505050565b600082601f8301126101d557600080fd5b81516001600160401b038111156101ee576101ee610101565b602060405181830201818110828211171561020b5761020b610101565b60405291825290565b600181811c9082168061022857607f821691505b60208210810361024857634e487b7160e01b600052602260045260246000fd5b50919050565b6106f08061025e6000396000f3fe608060405234801561001057600080fd5b50600436106100885760003560e01c8063313ce5671161005b578063313ce5671461012357806370a082311461013857806395d89b4114610161578063a9059cbb14610169578063dd62ed3e1461017c57600080fd5b806306fdde031461008d578063095ea7b3146100ab57806318160ddd146100ce57806323b872dd14610110575b600080fd5b6100956101b5565b6040516100a291906104ff565b60405180910390f35b6100be6100b9366004610570565b610247565b60405190151581526020016100a2565b6002547effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff165b6040519081526020016100a2565b6100be61011e36600461059a565b61025d565b60055460405160ff90911681526020016100a2565b6100f26101463660046105d6565b6001600160a01b031660009081526020819052604090205490565b610095610349565b6100be610177366004610570565b610358565b6100f261018a3660046105f8565b6001600160a01b03918216600090815260016020908152604080832093909416825291909152205490565b6060600380546101c49061062b565b80601f01602080910402602001604051908101604052809291908181526020018280546101f09061062b565b801561023d5780601f106102125761010080835404028352916020019161023d565b820191906000526020600020905b81548152906001019060200180831161022057829003601f168201915b5050505050905090565b6000610254338484610365565b50600192915050565b600061026a848484610420565b6001600160a01b0384166000908152600160209081526040808320338452909152902054828110156103195760405162461bcd60e51b815260206004820152604660248201527f45524332303a207472616e7366657220616d6f756e742065786365656473206160448201527f6c6c6f77616e6365000000000000000000000000000000000000000000000000606482015260840160405180910390fd5b6001600160a01b03851660009081526001602090815260408083203384529091529020805484900390555060019150509392505050565b6060600480546101c49061062b565b6000610254338484610420565b6001600160a01b0383166103ba5760405162461bcd60e51b815260206004820152601860248201527f617070726f7665206e756c6c2061646472657373000000000000000000000000604482015260640160405180910390fd5b6001600160a01b0383811660008181526001602090815260408083209487168084529482529182902085905590518481527f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925910160405180910390a3505050565b6001600160a01b0383166104755760405162461bcd60e51b815260206004820152601660248201527f7472616e73666572206e756c6c206164647265737300000000000000000000604482015260640160405180910390fd5b6001600160a01b038316600090815260208190526040902054818110156104de5760405162461bcd60e51b815260206004820152601760248201527f7472616e7366657220616d6f756e7420657863656564730000000000000000604482015260640160405180910390fd5b6001600160a01b0384166000908152602081905260409020805483019055909155505050565b600060208083528351808285015260005b8181101561052c57858101830151858201604001528201610510565b8181111561053e576000604083870101525b50601f01601f1916929092016040019392505050565b80356001600160a01b038116811461056b57600080fd5b919050565b6000806040838503121561058357600080fd5b61058c83610554565b946020939093013593505050565b6000806000606084860312156105af57600080fd5b6105b884610554565b92506105c660208501610554565b9150604084013590509250925092565b6000602082840312156105e857600080fd5b6105f182610554565b9392505050565b6000806040838503121561060b57600080fd5b61061483610554565b915061062260208401610554565b90509250929050565b600181811c9082168061063f57607f821691505b60208210810361065f57634e487b7160e01b600052602260045260246000fd5b5091905056fea26469706673582212200fa64a3a19f207c9e42794c46c43f3bcf90ad5c31bb02c93e879dfa613c5b81364736f6c63430008110033";
    const ERC20_ABI = [
      "constructor(string name, string symbol, uint256 totalSupply)"
    ];
    
    const usdtFactory = new ethers.ContractFactory(ERC20_ABI, ERC20_BYTECODE, sepoliaWallet);
    console.log("Deploying USDT...");
    const usdt = await usdtFactory.deploy(
      "Test USDT",
      "USDT",
      ethers.parseUnits("1000000", 6) // 1M USDT with 6 decimals
    );
    console.log("Transaction hash:", usdt.deploymentTransaction()?.hash);
    await usdt.waitForDeployment();
    
    deployments.sepolia.usdtToken = await usdt.getAddress();
    console.log("✅ USDT deployed at:", deployments.sepolia.usdtToken);
    
    // 3. Deploy DAI on Base Sepolia
    console.log("\n=== 3/3 Deploying DAI on Base Sepolia ===");
    
    const daiFactory = new ethers.ContractFactory(ERC20_ABI, ERC20_BYTECODE, baseSepoliaWallet);
    console.log("Deploying DAI...");
    const dai = await daiFactory.deploy(
      "Test DAI",
      "DAI",
      ethers.parseUnits("1000000", 18) // 1M DAI with 18 decimals
    );
    console.log("Transaction hash:", dai.deploymentTransaction()?.hash);
    await dai.waitForDeployment();
    
    deployments.baseSepolia.daiToken = await dai.getAddress();
    console.log("✅ DAI deployed at:", deployments.baseSepolia.daiToken);
    
    // For now, use mock EscrowFactory addresses since the real deployment requires CREATE3
    console.log("\n=== Using Mock EscrowFactory Addresses ===");
    deployments.sepolia.escrowFactory = "0x1234567890123456789012345678901234567890";
    deployments.baseSepolia.escrowFactory = "0x4567890123456789012345678901234567890123";
    console.log("⚠️  Note: EscrowFactory addresses are mocked for testing");
    
    // Save deployments
    const deploymentsPath = path.join(process.cwd(), "simple_deployments.json");
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("\n✅ Deployment addresses saved to simple_deployments.json");
    
    // Update .env file
    console.log("\n=== Updating .env file ===");
    const envPath = path.join(process.cwd(), ".env");
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Add deployed addresses to env
    const envAdditions = `
# Deployed Contract Addresses
SEPOLIA_RELAYER_CONTRACT=${deployments.sepolia.relayerContract}
SEPOLIA_USDT_TOKEN=${deployments.sepolia.usdtToken}
BASE_SEPOLIA_DAI_TOKEN=${deployments.baseSepolia.daiToken}
`;
    
    if (!envContent.includes('# Deployed Contract Addresses')) {
      envContent += envAdditions;
      fs.writeFileSync(envPath, envContent);
      console.log("✅ .env file updated with deployed addresses");
    }
    
    console.log("\n🎉 Deployments completed successfully!");
    console.log("\nDeployed contracts:");
    console.log(JSON.stringify(deployments, null, 2));
    
    // Next steps
    console.log("\n📋 Next Steps:");
    console.log("1. Fund test wallets (user and resolver)");
    console.log("2. Start relayer service");
    console.log("3. Start resolver service");
    console.log("4. Run cross-chain swap test");
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
  }
}

deploySimple().catch(console.error);