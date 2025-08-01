import { Account, RpcProvider, Contract, CallData } from "starknet";
import * as fs from "fs";
import * as path from "path";

async function finalDeploy() {
  const address = "0x0422bec5e5fbe0464b5b8889d874737c4cf72fe4f57bb6fb95b5ee688d96555b";
  const privateKey = "0x023cdf5995235ab6088819fecd630da238f0f9360e6fe0f3c15f4c31f65bfe1a";
  
  console.log("🚀 StarkNet Counter Contract Deployment");
  console.log("=====================================");
  console.log(`Account: ${address}`);
  console.log(`Network: StarkNet Sepolia`);
  
  const provider = new RpcProvider({ 
    nodeUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  // Step 1: Verify account
  console.log("\n1️⃣ Verifying account...");
  const account = new Account(provider, address, privateKey);
  
  try {
    const nonce = await account.getNonce();
    console.log(`✅ Account found with nonce: ${nonce}`);
  } catch (error: any) {
    console.log("❌ Account not found or not deployed");
    console.log("Please ensure:");
    console.log("- You funded the correct address on StarkNet Sepolia");
    console.log("- The funding transaction has been confirmed");
    console.log("- You're using the correct network");
    return false;
  }
  
  // Step 2: Check balance
  console.log("\n2️⃣ Checking ETH balance...");
  try {
    const ethTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    const result = await provider.callContract({
      contractAddress: ethTokenAddress,
      entrypoint: "balanceOf",
      calldata: [address]
    });
    
    const low = BigInt(result[0] || "0");
    const high = BigInt(result[1] || "0");
    const balance = low + (high << 128n);
    const ethBalance = Number(balance) / 1e18;
    
    console.log(`✅ ETH Balance: ${ethBalance} ETH`);
    
    if (balance === 0n) {
      console.log("❌ Insufficient balance for deployment");
      return false;
    }
  } catch (error) {
    console.log("⚠️  Could not check balance, proceeding anyway...");
  }
  
  // Step 3: Load contracts
  console.log("\n3️⃣ Loading compiled contracts...");
  const contractPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.contract_class.json");
  const casmPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.compiled_contract_class.json");
  
  if (!fs.existsSync(contractPath) || !fs.existsSync(casmPath)) {
    console.log("❌ Contracts not compiled. Run 'scarb build' first.");
    return false;
  }
  
  const compiledContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const compiledCasm = JSON.parse(fs.readFileSync(casmPath, "utf8"));
  console.log("✅ Contracts loaded");
  
  try {
    // Step 4: Declare contract
    console.log("\n4️⃣ Declaring Counter contract...");
    const declareResponse = await account.declare({
      contract: compiledContract,
      casm: compiledCasm,
    });
    
    if (declareResponse.transaction_hash) {
      console.log(`📝 Declaration tx: ${declareResponse.transaction_hash}`);
      console.log("⏳ Waiting for declaration confirmation...");
      await provider.waitForTransaction(declareResponse.transaction_hash);
      console.log(`✅ Contract class declared: ${declareResponse.class_hash}`);
    } else {
      console.log(`✅ Contract class already declared: ${declareResponse.class_hash}`);
    }
    
    // Step 5: Deploy contract
    console.log("\n5️⃣ Deploying Counter contract...");
    const deployResponse = await account.deployContract({
      classHash: declareResponse.class_hash!,
      constructorCalldata: CallData.compile([0]), // initial_value = 0
    });
    
    console.log(`📝 Deploy tx: ${deployResponse.transaction_hash}`);
    console.log("⏳ Waiting for deployment confirmation...");
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    const contractAddress = deployResponse.contract_address;
    console.log(`✅ Counter deployed at: ${contractAddress}`);
    
    // Step 6: Test the contract
    console.log("\n6️⃣ Testing deployed contract...");
    const contract = new Contract(compiledContract.abi, contractAddress, provider);
    contract.connect(account);
    
    // Get initial value
    const initialValue = await contract.get_counter();
    console.log(`📊 Initial counter value: ${initialValue}`);
    
    // Test increase
    console.log("🔼 Testing increase_counter...");
    const increaseTx = await contract.increase_counter();
    console.log(`📝 Increase tx: ${increaseTx.transaction_hash}`);
    await provider.waitForTransaction(increaseTx.transaction_hash);
    
    const newValue = await contract.get_counter();
    console.log(`📊 New counter value: ${newValue}`);
    
    // Verify test
    if (Number(newValue) === Number(initialValue) + 1) {
      console.log("✅ Contract test PASSED!");
    } else {
      console.log("❌ Contract test FAILED!");
      return false;
    }
    
    // Step 7: Update configuration
    console.log("\n7️⃣ Updating configuration...");
    const envPath = path.join(__dirname, "../.env");
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
      /COUNTER_CONTRACT_ADDRESS=.*/,
      `COUNTER_CONTRACT_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(envPath, envContent);
    
    // Save deployment info
    const deploymentInfo = {
      network: "starknet-sepolia",
      accountAddress: address,
      contractAddress: contractAddress,
      classHash: declareResponse.class_hash,
      deploymentTx: deployResponse.transaction_hash,
      timestamp: new Date().toISOString(),
      initialValue: 0,
      testPassed: true
    };
    
    const deploymentsPath = path.join(__dirname, "../deployments.json");
    fs.writeFileSync(deploymentsPath, JSON.stringify(deploymentInfo, null, 2));
    
    console.log("\n🎉 DEPLOYMENT SUCCESSFUL!");
    console.log("========================");
    console.log(`Account: ${address}`);
    console.log(`Contract: ${contractAddress}`);
    console.log(`Explorer: https://sepolia.starkscan.co/contract/${contractAddress}`);
    console.log("\n🧪 Ready to run tests:");
    console.log("yarn test");
    console.log("\n🎮 Try these commands:");
    console.log("yarn counter:get");
    console.log("yarn counter:increase");
    console.log("yarn counter:decrease");
    
    return true;
    
  } catch (error: any) {
    console.log(`\n❌ Deployment failed: ${error.message}`);
    
    if (error.message.includes("insufficient")) {
      console.log("💡 This usually means insufficient ETH balance for gas fees");
    }
    
    return false;
  }
}

finalDeploy().catch(console.error);