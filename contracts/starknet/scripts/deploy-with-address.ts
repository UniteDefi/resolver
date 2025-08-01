import { Account, RpcProvider, Contract, CallData } from "starknet";
import * as fs from "fs";
import * as path from "path";

// UPDATE THIS WITH YOUR ACTUAL FUNDED ACCOUNT ADDRESS
const FUNDED_ACCOUNT_ADDRESS = process.argv[2] || "0x_YOUR_FUNDED_ADDRESS_HERE";
const PRIVATE_KEY = "0x023cdf5995235ab6088819fecd630da238f0f9360e6fe0f3c15f4c31f65bfe1a";

async function deployWithAddress() {
  if (!FUNDED_ACCOUNT_ADDRESS || FUNDED_ACCOUNT_ADDRESS.includes("_YOUR_")) {
    console.log("Usage: yarn ts-node scripts/deploy-with-address.ts <FUNDED_ADDRESS>");
    console.log("Example: yarn ts-node scripts/deploy-with-address.ts 0x1234567890abcdef...");
    return;
  }
  
  console.log("[Deploy] Starting deployment...");
  console.log(`[Deploy] Using account: ${FUNDED_ACCOUNT_ADDRESS}`);
  
  const provider = new RpcProvider({ 
    nodeUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  // Check balance first
  try {
    const ethTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    const result = await provider.callContract({
      contractAddress: ethTokenAddress,
      entrypoint: "balanceOf",
      calldata: [FUNDED_ACCOUNT_ADDRESS]
    });
    
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const balance = low + (high << 128n);
    
    console.log(`[Deploy] ETH balance: ${Number(balance) / 1e18} ETH`);
    
    if (balance === 0n) {
      console.log("[Deploy] ❌ Account has no ETH balance");
      return false;
    }
    
  } catch (error) {
    console.log("[Deploy] Could not check balance, proceeding...");
  }
  
  const account = new Account(provider, FUNDED_ACCOUNT_ADDRESS, PRIVATE_KEY);
  
  // Load contracts
  const contractPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.contract_class.json");
  const casmPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.compiled_contract_class.json");
  
  const compiledContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const compiledCasm = JSON.parse(fs.readFileSync(casmPath, "utf8"));
  
  try {
    // Declare and deploy
    console.log("[Deploy] Declaring contract...");
    const declareResponse = await account.declare({
      contract: compiledContract,
      casm: compiledCasm,
    });
    
    if (declareResponse.transaction_hash) {
      console.log(`[Deploy] Declaration tx: ${declareResponse.transaction_hash}`);
      await provider.waitForTransaction(declareResponse.transaction_hash);
    }
    
    console.log("[Deploy] Deploying contract...");
    const deployResponse = await account.deployContract({
      classHash: declareResponse.class_hash!,
      constructorCalldata: CallData.compile([0]),
    });
    
    console.log(`[Deploy] Deploy tx: ${deployResponse.transaction_hash}`);
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    const contractAddress = deployResponse.contract_address;
    console.log(`[Deploy] ✅ Contract deployed: ${contractAddress}`);
    
    // Test it
    const contract = new Contract(compiledContract.abi, contractAddress, provider);
    contract.connect(account);
    
    const initialValue = await contract.get_counter();
    console.log(`[Deploy] Initial value: ${initialValue}`);
    
    const increaseTx = await contract.increase_counter();
    await provider.waitForTransaction(increaseTx.transaction_hash);
    
    const newValue = await contract.get_counter();
    console.log(`[Deploy] After increase: ${newValue}`);
    
    // Update .env
    const envPath = path.join(__dirname, "../.env");
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
      /STARKNET_ACCOUNT_ADDRESS=.*/,
      `STARKNET_ACCOUNT_ADDRESS=${FUNDED_ACCOUNT_ADDRESS}`
    );
    envContent = envContent.replace(
      /COUNTER_CONTRACT_ADDRESS=.*/,
      `COUNTER_CONTRACT_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(envPath, envContent);
    
    console.log("\n🎉 SUCCESS! Ready to run tests with:");
    console.log("yarn test");
    
    return true;
    
  } catch (error: any) {
    console.error("[Deploy] Error:", error.message);
    return false;
  }
}

deployWithAddress().catch(console.error);