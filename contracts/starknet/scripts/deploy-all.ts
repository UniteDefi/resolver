import { Account, RpcProvider, Contract, CallData, hash } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function deployAll() {
  console.log("[DeployAll] Starting complete deployment...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  
  if (!accountAddress || !privateKey) {
    throw new Error("Missing account configuration");
  }
  
  console.log(`[DeployAll] Using account: ${accountAddress}`);
  
  try {
    // Create account instance
    const account = new Account(provider, accountAddress, privateKey, "1");
    
    // Check if account is deployed by trying to get nonce
    let accountDeployed = false;
    try {
      await account.getNonce();
      accountDeployed = true;
      console.log("[DeployAll] ✅ Account already deployed");
    } catch (error) {
      console.log("[DeployAll] Account not deployed yet, will deploy with first transaction");
    }
    
    // Load compiled contract
    const contractPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.contract_class.json");
    const casmPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.compiled_contract_class.json");
    
    if (!fs.existsSync(contractPath) || !fs.existsSync(casmPath)) {
      throw new Error("Contract not compiled. Run 'scarb build' first.");
    }
    
    const compiledContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const compiledCasm = JSON.parse(fs.readFileSync(casmPath, "utf8"));
    
    // Declare the counter contract
    console.log("[DeployAll] Declaring Counter contract...");
    
    try {
      const declareResponse = await account.declare({
        contract: compiledContract,
        casm: compiledCasm,
      });
      
      if (declareResponse.transaction_hash) {
        console.log(`[DeployAll] Declaration tx: ${declareResponse.transaction_hash}`);
        await provider.waitForTransaction(declareResponse.transaction_hash);
        console.log(`[DeployAll] Class declared: ${declareResponse.class_hash}`);
      } else {
        console.log(`[DeployAll] Class already declared: ${declareResponse.class_hash}`);
      }
      
      // Deploy the contract
      console.log("[DeployAll] Deploying Counter contract...");
      const deployResponse = await account.deployContract({
        classHash: declareResponse.class_hash!,
        constructorCalldata: CallData.compile([0]), // initial_value = 0
      });
      
      console.log(`[DeployAll] Deploy tx: ${deployResponse.transaction_hash}`);
      await provider.waitForTransaction(deployResponse.transaction_hash);
      
      const contractAddress = deployResponse.contract_address;
      console.log(`[DeployAll] ✅ Counter deployed at: ${contractAddress}`);
      
      // Update .env with contract address
      const envPath = path.join(__dirname, "../.env");
      let envContent = fs.readFileSync(envPath, "utf8");
      envContent = envContent.replace(
        /COUNTER_CONTRACT_ADDRESS=.*/,
        `COUNTER_CONTRACT_ADDRESS=${contractAddress}`
      );
      fs.writeFileSync(envPath, envContent);
      console.log("[DeployAll] Updated .env with contract address");
      
      // Test the deployed contract
      console.log("\n[DeployAll] Testing deployed contract...");
      
      const contract = new Contract(compiledContract.abi, contractAddress, provider);
      contract.connect(account);
      
      // Get initial value
      const initialValue = await contract.get_counter();
      console.log(`[DeployAll] Initial counter value: ${initialValue}`);
      
      // Test increase
      console.log("[DeployAll] Testing increase_counter...");
      const increaseTx = await contract.increase_counter();
      console.log(`[DeployAll] Increase tx: ${increaseTx.transaction_hash}`);
      await provider.waitForTransaction(increaseTx.transaction_hash);
      
      const newValue = await contract.get_counter();
      console.log(`[DeployAll] New counter value: ${newValue}`);
      
      if (Number(newValue) === Number(initialValue) + 1) {
        console.log("[DeployAll] ✅ Contract working correctly!");
      } else {
        console.log("[DeployAll] ❌ Contract test failed");
        return false;
      }
      
      // Save deployment info
      const deploymentInfo = {
        network: "starknet-sepolia",
        contractAddress: contractAddress,
        classHash: declareResponse.class_hash,
        deploymentTx: deployResponse.transaction_hash,
        deployer: accountAddress,
        timestamp: new Date().toISOString(),
        initialValue: 0,
        testPassed: true
      };
      
      const deploymentsPath = path.join(__dirname, "../deployments.json");
      fs.writeFileSync(deploymentsPath, JSON.stringify(deploymentInfo, null, 2));
      console.log("[DeployAll] Deployment info saved to deployments.json");
      
      console.log("\n[DeployAll] 🎉 Deployment completed successfully!");
      console.log(`[DeployAll] Contract: ${contractAddress}`);
      console.log(`[DeployAll] Explorer: https://sepolia.starkscan.co/contract/${contractAddress}`);
      
      return true;
      
    } catch (error: any) {
      console.error("[DeployAll] Deployment failed:", error.message);
      return false;
    }
    
  } catch (error) {
    console.error("[DeployAll] Error:", error);
    return false;
  }
}

deployAll().catch(console.error);