import { Account, ec, json, stark, RpcProvider, hash, CallData, Contract } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function simpleSetup() {
  console.log("[Setup] Simple StarkNet setup...");
  
  // For testing, we'll use a pre-funded devnet account or you can use your existing funded account
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  // Option 1: Use environment variables if you have a funded account
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  
  if (!privateKey || !accountAddress) {
    console.error("[Setup] Please set STARKNET_PRIVATE_KEY and STARKNET_ACCOUNT_ADDRESS");
    console.log("\nIf you have an existing funded account (e.g., from Argent X or Braavos):");
    console.log("1. Export your private key from your wallet");
    console.log("2. Set STARKNET_ACCOUNT_ADDRESS to your wallet address");
    console.log("3. Set STARKNET_PRIVATE_KEY to your exported private key");
    return;
  }
  
  try {
    // Create account instance
    const account = new Account(provider, accountAddress, privateKey);
    
    // Test the account by checking balance
    const balance = await provider.getBalance(accountAddress);
    console.log(`[Setup] Account balance: ${balance} wei`);
    
    if (BigInt(balance) === 0n) {
      console.error("[Setup] Account has no balance! Please fund it first.");
      return;
    }
    
    console.log("[Setup] ✅ Account is ready!");
    console.log(`[Setup] Address: ${accountAddress}`);
    
    // Now let's deploy the counter contract
    console.log("\n[Setup] Compiling and deploying Counter contract...");
    
    // Load compiled contract
    const contractPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.contract_class.json");
    
    if (!fs.existsSync(contractPath)) {
      console.log("[Setup] Contract not compiled. Let's compile it first...");
      console.log("[Setup] Run: scarb build");
      return;
    }
    
    const compiledContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    
    // For simple deployment, we'll use declareAndDeploy
    console.log("[Setup] Deploying Counter contract...");
    
    // First declare the class
    const declareResponse = await account.declare({
      contract: compiledContract,
      classHash: compiledContract.classHash || hash.computeContractClassHash(compiledContract),
    });
    
    if (declareResponse.transaction_hash) {
      console.log(`[Setup] Declaration tx: ${declareResponse.transaction_hash}`);
      await provider.waitForTransaction(declareResponse.transaction_hash);
    }
    
    console.log(`[Setup] Class declared: ${declareResponse.class_hash}`);
    
    // Deploy the contract
    const deployResponse = await account.deployContract({
      classHash: declareResponse.class_hash!,
      constructorCalldata: [0], // initial_value = 0
    });
    
    console.log(`[Setup] Deploy tx: ${deployResponse.transaction_hash}`);
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    const contractAddress = deployResponse.contract_address;
    console.log(`[Setup] ✅ Counter deployed at: ${contractAddress}`);
    
    // Update .env with the contract address
    const envPath = path.join(__dirname, "../.env");
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
      /COUNTER_CONTRACT_ADDRESS=.*/,
      `COUNTER_CONTRACT_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(envPath, envContent);
    
    // Test the contract
    console.log("\n[Setup] Testing the contract...");
    
    const abi = JSON.parse(fs.readFileSync(
      path.join(__dirname, "../target/dev/unite_starknet_Counter.contract_class.json"),
      "utf8"
    )).abi;
    
    const contract = new Contract(abi, contractAddress, provider);
    contract.connect(account);
    
    // Get initial value
    const initialValue = await contract.get_counter();
    console.log(`[Setup] Initial counter value: ${initialValue}`);
    
    // Increase counter
    console.log("[Setup] Increasing counter...");
    const increaseTx = await contract.increase_counter();
    await provider.waitForTransaction(increaseTx.transaction_hash);
    
    const newValue = await contract.get_counter();
    console.log(`[Setup] New counter value: ${newValue}`);
    
    console.log("\n[Setup] ✅ Everything is working!");
    console.log("\nYou can now run:");
    console.log("  yarn test           - Run the test suite");
    console.log("  yarn counter:get    - Get counter value");
    console.log("  yarn counter:increase - Increase counter");
    console.log("  yarn counter:decrease - Decrease counter");
    
  } catch (error) {
    console.error("[Setup] Error:", error);
  }
}

simpleSetup().catch(console.error);