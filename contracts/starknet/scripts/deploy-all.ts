import { Account, RpcProvider, Contract, CallData, ClassHash } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface ContractInfo {
  classHash: string;
  address: string;
  deploymentTx: string;
}

interface DeploymentResult {
  UniteLimitOrderProtocol: ContractInfo;
  UniteEscrowFactory: ContractInfo;
  UniteEscrow: ContractInfo;
  UniteResolver0: ContractInfo;
  UniteResolver1: ContractInfo;
  MockUSDT: ContractInfo;
  MockDAI: ContractInfo;
  MockWrappedNative: ContractInfo;
}

async function deployAll(): Promise<DeploymentResult> {
  console.log("[DeployAll] Starting StarkNet HTLC deployment...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  const resolver0Address = process.env.STARKNET_RESOLVER_WALLET_0;
  const resolver1Address = process.env.STARKNET_RESOLVER_WALLET_1;
  
  if (!accountAddress || !privateKey) {
    throw new Error("Missing account configuration");
  }
  
  console.log(`[DeployAll] Using account: ${accountAddress}`);
  console.log(`[DeployAll] Resolver 0: ${resolver0Address}`);
  console.log(`[DeployAll] Resolver 1: ${resolver1Address}`);
  
  const account = new Account(provider, accountAddress, privateKey);
  
  // Load compiled contracts
  const loadContract = (name: string) => {
    const contractPath = path.join(__dirname, `../target/dev/unite_starknet_${name}.contract_class.json`);
    const casmPath = path.join(__dirname, `../target/dev/unite_starknet_${name}.compiled_contract_class.json`);
    
    if (!fs.existsSync(contractPath) || !fs.existsSync(casmPath)) {
      throw new Error(`Contract ${name} not compiled. Run 'scarb build' first.`);
    }
    
    return {
      contract: JSON.parse(fs.readFileSync(contractPath, "utf8")),
      casm: JSON.parse(fs.readFileSync(casmPath, "utf8"))
    };
  };
  
  const deployContract = async (name: string, constructorCalldata: any[] = []) => {
    console.log(`[DeployAll] Deploying ${name}...`);
    
    const { contract, casm } = loadContract(name);
    
    // Declare contract
    const declareResponse = await account.declare({
      contract,
      casm,
    });
    
    if (declareResponse.transaction_hash) {
      console.log(`[DeployAll] ${name} declaration tx: ${declareResponse.transaction_hash}`);
      await provider.waitForTransaction(declareResponse.transaction_hash);
    }
    
    console.log(`[DeployAll] ${name} class hash: ${declareResponse.class_hash}`);
    
    // Deploy contract
    const deployResponse = await account.deployContract({
      classHash: declareResponse.class_hash!,
      constructorCalldata: CallData.compile(constructorCalldata),
    });
    
    console.log(`[DeployAll] ${name} deploy tx: ${deployResponse.transaction_hash}`);
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    console.log(`[DeployAll] ✅ ${name} deployed at: ${deployResponse.contract_address}`);
    
    return {
      classHash: declareResponse.class_hash!,
      address: deployResponse.contract_address,
      deploymentTx: deployResponse.transaction_hash,
    };
  };
  
  // Deploy contracts in order
  
  // 1. Deploy LimitOrderProtocol
  const lop = await deployContract("UniteLimitOrderProtocol");
  
  // 2. Deploy mock tokens
  const mockUSDT = await deployContract("MockUSDT", [
    "Mock USDT", "USDT", 6, "1000000000000", accountAddress // 1M USDT with 6 decimals
  ]);
  
  const mockDAI = await deployContract("MockDAI", [
    "Mock DAI", "DAI", 18, "1000000000000000000000000", accountAddress // 1M DAI with 18 decimals
  ]);
  
  const mockWrappedNative = await deployContract("MockWrappedNative", [
    "Wrapped Ether", "WETH"
  ]);
  
  // 3. Deploy Escrow (get class hash for factory)
  const escrow = await deployContract("UniteEscrow", [
    0, 0, accountAddress, accountAddress, mockUSDT.address, 0, 0, 0, 0, 0, 0, 1, 0 // dummy values
  ]);
  
  // 4. Deploy EscrowFactory
  const factory = await deployContract("UniteEscrowFactory", [
    accountAddress, escrow.classHash
  ]);
  
  // 5. Deploy Resolvers
  const resolver0 = await deployContract("UniteResolver", [
    factory.address, lop.address, resolver0Address || accountAddress
  ]);
  
  const resolver1 = await deployContract("UniteResolver", [
    factory.address, lop.address, resolver1Address || accountAddress
  ]);
  
  const result: DeploymentResult = {
    UniteLimitOrderProtocol: lop,
    UniteEscrowFactory: factory,
    UniteEscrow: escrow,
    UniteResolver0: resolver0,
    UniteResolver1: resolver1,
    MockUSDT: mockUSDT,
    MockDAI: mockDAI,
    MockWrappedNative: mockWrappedNative,
  };
  
  // Save deployment info
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  let deployments: any = {};
  
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  
  deployments.starknet = {
    network: "starknet-sepolia",
    chainId: "0x534e5f5345504f4c4941", // SN_SEPOLIA
    deployer: accountAddress,
    timestamp: new Date().toISOString(),
    contracts: result
  };
  
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("[DeployAll] Deployment info saved to deployments.json");
  
  console.log("\n[DeployAll] 🎉 All contracts deployed successfully!");
  console.log(`[DeployAll] Network: StarkNet Sepolia`);
  console.log(`[DeployAll] Account: ${accountAddress}`);
  
  return result;
}

if (require.main === module) {
  deployAll().catch(console.error);
}

export default deployAll;
