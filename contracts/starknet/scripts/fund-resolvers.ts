import { Account, RpcProvider, Contract } from "starknet";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function fundResolvers() {
  console.log("[FundResolvers] Funding resolvers with test tokens...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  const privateKey = process.env.STARKNET_PRIVATE_KEY;
  const resolver0Address = process.env.STARKNET_RESOLVER_WALLET_0;
  const resolver1Address = process.env.STARKNET_RESOLVER_WALLET_1;
  const testUserAddress = process.env.STARKNET_TEST_USER_ADDRESS;
  
  if (!accountAddress || !privateKey) {
    throw new Error("Missing account configuration");
  }
  
  const account = new Account(provider, accountAddress, privateKey);
  
  // Load deployment info
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("No deployments found. Run deploy-all.ts first.");
  }
  
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const starknetDeployment = deployments.starknet;
  
  if (!starknetDeployment) {
    throw new Error("No StarkNet deployment found");
  }
  
  // Load ERC20 ABI
  const erc20Abi = [
    {
      "name": "transfer",
      "type": "function",
      "inputs": [
        { "name": "recipient", "type": "felt" },
        { "name": "amount", "type": "Uint256" }
      ],
      "outputs": [{ "name": "success", "type": "felt" }],
      "state_mutability": "external"
    },
    {
      "name": "mint",
      "type": "function", 
      "inputs": [
        { "name": "to", "type": "felt" },
        { "name": "amount", "type": "Uint256" }
      ],
      "outputs": [],
      "state_mutability": "external"
    }
  ];
  
  const mockUSDT = new Contract(erc20Abi, starknetDeployment.contracts.MockUSDT.address, provider);
  const mockDAI = new Contract(erc20Abi, starknetDeployment.contracts.MockDAI.address, provider);
  
  mockUSDT.connect(account);
  mockDAI.connect(account);
  
  // Funding amounts
  const usdtAmount = { low: "10000000000", high: "0" }; // 10k USDT (6 decimals)
  const daiAmount = { low: "10000000000000000000000", high: "0" }; // 10k DAI (18 decimals)
  
  const addresses = [
    { name: "Resolver 0", address: resolver0Address },
    { name: "Resolver 1", address: resolver1Address },
    { name: "Test User", address: testUserAddress },
  ].filter(item => item.address);
  
  for (const item of addresses) {
    if (!item.address) continue;
    
    console.log(`[FundResolvers] Funding ${item.name}: ${item.address}`);
    
    try {
      // Transfer USDT
      const usdtTx = await mockUSDT.transfer(item.address, usdtAmount);
      await provider.waitForTransaction(usdtTx.transaction_hash);
      console.log(`[FundResolvers] ✅ Transferred USDT to ${item.name}`);
      
      // Transfer DAI  
      const daiTx = await mockDAI.transfer(item.address, daiAmount);
      await provider.waitForTransaction(daiTx.transaction_hash);
      console.log(`[FundResolvers] ✅ Transferred DAI to ${item.name}`);
      
    } catch (error: any) {
      console.log(`[FundResolvers] ❌ Failed to fund ${item.name}: ${error.message}`);
    }
  }
  
  console.log("[FundResolvers] ✅ Funding completed!");
}

if (require.main === module) {
  fundResolvers().catch(console.error);
}

export default fundResolvers;
