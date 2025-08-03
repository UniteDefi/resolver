import { Account, RpcProvider, Contract, CallData, shortString, uint256 } from "starknet";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

interface DeploymentConfig {
  network: string;
  chainId: string;
  rpcUrl: string;
  deployer: string;
  timestamp: string;
  contracts: {
    [key: string]: {
      classHash: string;
      address: string;
      deploymentTx: string;
    };
  };
}

async function deployContracts() {
  console.log("🚀 Starting Starknet contract deployment...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS!;
  const privateKey = process.env.STARKNET_PRIVATE_KEY!;
  
  if (!accountAddress || !privateKey) {
    throw new Error("Missing STARKNET_ACCOUNT_ADDRESS or STARKNET_PRIVATE_KEY in .env file");
  }
  
  const account = new Account(provider, accountAddress, privateKey);
  
  console.log("📋 Deployment Configuration:");
  console.log("- Network: Starknet Sepolia");
  console.log("- Deployer:", accountAddress);
  console.log("- RPC URL:", process.env.STARKNET_RPC_URL);
  
  // // Check account balance
  // try {
  //   const ethContract = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
  //   const { result } = await provider.call({
  //     contractAddress: ethContract,
  //     entrypoint: "balanceOf",
  //     calldata: [accountAddress]
  //   });
  //   console.log("- Account Balance:", uint256.uint256ToBN({ low: result[0], high: result[1] }).toString(), "wei");
  // } catch (error) {
  //   console.error("❌ Error checking balance:", error);
  //   console.log("⚠️ Continuing deployment (balance check failed)...");
  // }
  
  const deployments: DeploymentConfig = {
    network: "starknet-sepolia",
    chainId: "0x534e5f5345504f4c4941",
    rpcUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
    deployer: accountAddress,
    timestamp: new Date().toISOString(),
    contracts: {}
  };
  
  try {
    // 1. Deploy Mock Tokens
    console.log("\n🪙 Deploying Mock Tokens...");
    
    const mockUSDTResult = await deployContract(account, "SimpleMockUSDT", [
      shortString.encodeShortString("Mock USDT"),
      shortString.encodeShortString("USDT"),
      6, // 6 decimals for USDT
      uint256.bnToUint256(0), // initial supply low
      uint256.bnToUint256(0), // initial supply high
      accountAddress // recipient
    ]);
    deployments.contracts.MockUSDT = mockUSDTResult;
    
    const mockDAIResult = await deployContract(account, "SimpleMockDAI", [
      shortString.encodeShortString("Mock DAI"),
      shortString.encodeShortString("DAI"),
      6, // 6 decimals for DAI
      uint256.bnToUint256(0), // initial supply low
      uint256.bnToUint256(0), // initial supply high  
      accountAddress // recipient
    ]);
    deployments.contracts.MockDAI = mockDAIResult;
    
    const mockWrappedNativeResult = await deployContract(account, "SimpleMockWrappedNative", [
      shortString.encodeShortString("Wrapped ETH"),
      shortString.encodeShortString("WETH")
    ]);
    deployments.contracts.MockWrappedNative = mockWrappedNativeResult;
    
    // // 2. Deploy Core Protocol Contracts
    // console.log("\n🏗️ Deploying Core Protocol...");
    
    // const limitOrderProtocolResult = await deployContract(account, "UniteLimitOrderProtocol", [
    //   accountAddress // owner
    // ]);
    // deployments.contracts.UniteLimitOrderProtocol = limitOrderProtocolResult;
    
    // const escrowFactoryResult = await deployContract(account, "UniteEscrowFactory", [
    //   accountAddress // owner
    // ]);
    // deployments.contracts.UniteEscrowFactory = escrowFactoryResult;
    
    // // 3. Deploy Resolver Contracts
    // console.log("\n🔧 Deploying Resolver Contracts...");
    
    // const resolver0Result = await deployContract(account, "UniteResolver", [
    //   escrowFactoryResult.address, // factory
    //   limitOrderProtocolResult.address, // limit order protocol
    //   process.env.STARKNET_RESOLVER_WALLET_0 || accountAddress // owner
    // ]);
    // deployments.contracts.UniteResolver0 = resolver0Result;
    
    // const resolver1Result = await deployContract(account, "UniteResolver", [
    //   escrowFactoryResult.address, // factory
    //   limitOrderProtocolResult.address, // limit order protocol
    //   process.env.STARKNET_RESOLVER_WALLET_1 || accountAddress // owner
    // ]);
    // deployments.contracts.UniteResolver1 = resolver1Result;
    
    // const resolver2Result = await deployContract(account, "UniteResolver", [
    //   escrowFactoryResult.address, // factory
    //   limitOrderProtocolResult.address, // limit order protocol
    //   process.env.STARKNET_RESOLVER_WALLET_2 || accountAddress // owner
    // ]);
    // deployments.contracts.UniteResolver2 = resolver2Result;
    
    // const resolver3Result = await deployContract(account, "UniteResolver", [
    //   escrowFactoryResult.address, // factory
    //   limitOrderProtocolResult.address, // limit order protocol
    //   process.env.STARKNET_RESOLVER_WALLET_3 || accountAddress // owner
    // ]);
    // deployments.contracts.UniteResolver3 = resolver3Result;
    
    // Save deployments to file
    const deploymentsPath = path.join(__dirname, "..", "deployments.json");
    const existingDeployments = fs.existsSync(deploymentsPath) 
      ? JSON.parse(fs.readFileSync(deploymentsPath, "utf8"))
      : {};
    
    existingDeployments.starknet = deployments;
    
    fs.writeFileSync(deploymentsPath, JSON.stringify(existingDeployments, null, 2));
    
    console.log("\n✅ DEPLOYMENT COMPLETE!");
    console.log("📄 Deployments saved to deployments.json");
    
    console.log("\n📋 Deployed Contracts:");
    Object.entries(deployments.contracts).forEach(([name, contract]) => {
      console.log(`- ${name}: ${contract.address}`);
    });
    
    return deployments;
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
  }
}

async function deployContract(
  account: Account,
  contractName: string,
  constructorCalldata: any[]
): Promise<{ classHash: string; address: string; deploymentTx: string; }> {
  console.log(`📦 Deploying ${contractName}...`);
  
  // Read compiled contract
  const compiledContractPath = path.join(__dirname, "..", "target", "dev", `unite_starknet_${contractName}.contract_class.json`);
  
  if (!fs.existsSync(compiledContractPath)) {
    throw new Error(`Compiled contract not found: ${compiledContractPath}. Run 'scarb build' first.`);
  }
  
  const compiledContract = JSON.parse(fs.readFileSync(compiledContractPath, "utf8"));
  
  // Declare the contract if needed
  console.log(`   Declaring ${contractName}...`);
  let classHash: string;
  
  try {
    const declareResponse = await account.declare({
      contract: compiledContract
    });
    
    classHash = declareResponse.class_hash;
    console.log(`   ✅ Declared with class hash: ${classHash}`);
    
    // Wait for transaction
    await account.waitForTransaction(declareResponse.transaction_hash);
    
  } catch (error: any) {
    if (error.message.includes("is already declared")) {
      // Extract class hash from error or calculate it
      const contractClass = compiledContract;
      classHash = "0x" + Buffer.from(JSON.stringify(contractClass)).toString("hex").slice(0, 63);
      console.log(`   ⚠️ Already declared, using class hash: ${classHash}`);
    } else {
      throw error;
    }
  }
  
  // Deploy the contract
  console.log(`   Deploying ${contractName}...`);
  const deployResponse = await account.deployContract({
    classHash,
    constructorCalldata
  });
  
  console.log(`   ✅ Deployed at address: ${deployResponse.contract_address}`);
  console.log(`   📝 Transaction hash: ${deployResponse.transaction_hash}`);
  
  // Wait for deployment transaction
  await account.waitForTransaction(deployResponse.transaction_hash);
  
  return {
    classHash,
    address: deployResponse.contract_address,
    deploymentTx: deployResponse.transaction_hash
  };
}

if (require.main === module) {
  deployContracts().catch(console.error);
}

export default deployContracts;