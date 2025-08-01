import { Account, RpcProvider, Contract, CallData } from "starknet";
import * as fs from "fs";
import * as path from "path";

async function manualDeploy() {
  console.log("[ManualDeploy] Starting manual deployment...");
  
  // You need to manually set your funded account address here
  const FUNDED_ACCOUNT_ADDRESS = "0x9f26f08db6240cc694e99939330d50813c51fa58e48c3e9e6f7352802d805c"; // Change this to your actual funded address
  const PRIVATE_KEY = "0x023cdf5995235ab6088819fecd630da238f0f9360e6fe0f3c15f4c31f65bfe1a";
  
  const provider = new RpcProvider({ 
    nodeUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  console.log(`[ManualDeploy] Using account: ${FUNDED_ACCOUNT_ADDRESS}`);
  
  // First, let's check if this account has balance
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
    
    console.log(`[ManualDeploy] ETH balance: ${Number(balance) / 1e18} ETH`);
    
    if (balance === 0n) {
      console.log("[ManualDeploy] ❌ Account has no ETH balance");
      console.log("[ManualDeploy] Please fund this address first:");
      console.log(`[ManualDeploy] ${FUNDED_ACCOUNT_ADDRESS}`);
      return false;
    }
    
    console.log("[ManualDeploy] ✅ Account has balance, proceeding...");
    
  } catch (error) {
    console.log("[ManualDeploy] Could not check balance, proceeding anyway...");
  }
  
  // Create account instance
  const account = new Account(provider, FUNDED_ACCOUNT_ADDRESS, PRIVATE_KEY);
  
  try {
    // Test account access
    console.log("[ManualDeploy] Testing account access...");
    const nonce = await account.getNonce();
    console.log(`[ManualDeploy] ✅ Account accessible, nonce: ${nonce}`);
    
  } catch (error: any) {
    if (error.message.includes("Contract not found")) {
      console.log("[ManualDeploy] ⚠️  Account contract not deployed yet");
      console.log("[ManualDeploy] This is normal for new accounts - it will be deployed on first transaction");
    } else {
      console.error("[ManualDeploy] Account access error:", error.message);
      return false;
    }
  }
  
  // Load compiled contract
  const contractPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.contract_class.json");
  const casmPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.compiled_contract_class.json");
  
  if (!fs.existsSync(contractPath) || !fs.existsSync(casmPath)) {
    console.error("[ManualDeploy] Contract not compiled. Run 'scarb build' first.");
    return false;
  }
  
  const compiledContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const compiledCasm = JSON.parse(fs.readFileSync(casmPath, "utf8"));
  
  try {
    // Declare the counter contract
    console.log("[ManualDeploy] Declaring Counter contract...");
    
    const declareResponse = await account.declare({
      contract: compiledContract,
      casm: compiledCasm,
    });
    
    if (declareResponse.transaction_hash) {
      console.log(`[ManualDeploy] Declaration tx: ${declareResponse.transaction_hash}`);
      console.log("[ManualDeploy] Waiting for declaration...");
      await provider.waitForTransaction(declareResponse.transaction_hash);
      console.log(`[ManualDeploy] ✅ Class declared: ${declareResponse.class_hash}`);
    } else {
      console.log(`[ManualDeploy] ✅ Class already declared: ${declareResponse.class_hash}`);
    }
    
    // Deploy the contract
    console.log("[ManualDeploy] Deploying Counter contract...");
    const deployResponse = await account.deployContract({
      classHash: declareResponse.class_hash!,
      constructorCalldata: CallData.compile([0]), // initial_value = 0
    });
    
    console.log(`[ManualDeploy] Deploy tx: ${deployResponse.transaction_hash}`);
    console.log("[ManualDeploy] Waiting for deployment...");
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    const contractAddress = deployResponse.contract_address;
    console.log(`[ManualDeploy] ✅ Counter deployed at: ${contractAddress}`);
    
    // Test the contract
    console.log("[ManualDeploy] Testing deployed contract...");
    const contract = new Contract(compiledContract.abi, contractAddress, provider);
    contract.connect(account);
    
    // Get initial value
    const initialValue = await contract.get_counter();
    console.log(`[ManualDeploy] Initial counter value: ${initialValue}`);
    
    // Test increase
    console.log("[ManualDeploy] Testing increase_counter...");
    const increaseTx = await contract.increase_counter();
    console.log(`[ManualDeploy] Increase tx: ${increaseTx.transaction_hash}`);
    await provider.waitForTransaction(increaseTx.transaction_hash);
    
    const newValue = await contract.get_counter();
    console.log(`[ManualDeploy] New counter value: ${newValue}`);
    
    if (Number(newValue) === Number(initialValue) + 1) {
      console.log("[ManualDeploy] ✅ Contract working correctly!");
    } else {
      console.log("[ManualDeploy] ❌ Contract test failed");
    }
    
    // Update .env
    const envPath = path.join(__dirname, "../.env");
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
      /COUNTER_CONTRACT_ADDRESS=.*/,
      `COUNTER_CONTRACT_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(envPath, envContent);
    
    console.log("\n[ManualDeploy] 🎉 Deployment completed successfully!");
    console.log(`[ManualDeploy] Account: ${FUNDED_ACCOUNT_ADDRESS}`);
    console.log(`[ManualDeploy] Contract: ${contractAddress}`);
    console.log(`[ManualDeploy] Explorer: https://sepolia.starkscan.co/contract/${contractAddress}`);
    
    return true;
    
  } catch (error: any) {
    console.error("[ManualDeploy] Deployment failed:", error.message);
    
    if (error.message.includes("insufficient funds") || error.message.includes("insufficient balance")) {
      console.log("\n[ManualDeploy] ❌ Insufficient funds!");
      console.log("[ManualDeploy] Please ensure your account has enough ETH for gas fees");
      console.log(`[ManualDeploy] Account: ${FUNDED_ACCOUNT_ADDRESS}`);
    }
    
    return false;
  }
}

manualDeploy().catch(console.error);