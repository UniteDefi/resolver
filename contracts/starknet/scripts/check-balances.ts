import { Account, RpcProvider, Contract } from "starknet";
import { JsonRpcProvider, Wallet, Contract as EthersContract } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const STARKNET_ERC20_ABI = [
  {
    "name": "balanceOf",
    "type": "function",
    "inputs": [{ "name": "account", "type": "felt" }],
    "outputs": [{ "name": "balance", "type": "Uint256" }],
    "state_mutability": "view"
  },
  {
    "name": "symbol",
    "type": "function",
    "inputs": [],
    "outputs": [{ "name": "symbol", "type": "felt" }],
    "state_mutability": "view"
  }
];

async function checkBalances() {
  console.log("💰 Checking token balances...");
  
  // Load deployments if available
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  let deployments: any = {};
  
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  
  // Check StarkNet balances
  console.log("\n--- StarkNet Token Balances ---");
  
  if (deployments.starknet?.contracts) {
    const provider = new RpcProvider({ 
      nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
    });
    
    const accounts = [
      { name: "Main Account", address: process.env.STARKNET_ACCOUNT_ADDRESS },
      { name: "Resolver 0", address: process.env.STARKNET_RESOLVER_WALLET_0 },
      { name: "Resolver 1", address: process.env.STARKNET_RESOLVER_WALLET_1 },
    ];
    
    const tokens = [
      { name: "MockUSDT", address: deployments.starknet.contracts.MockUSDT?.address, decimals: 6 },
      { name: "MockDAI", address: deployments.starknet.contracts.MockDAI?.address, decimals: 18 },
    ];
    
    for (const account of accounts) {
      if (!account.address) continue;
      
      console.log(`\n${account.name} (${account.address}):`);
      
      for (const token of tokens) {
        if (!token.address) continue;
        
        try {
          const contract = new Contract(STARKNET_ERC20_ABI, token.address, provider);
          const balance = await contract.balanceOf(account.address);
          const amount = parseFloat(balance.low.toString()) / Math.pow(10, token.decimals);
          console.log(`  ${token.name}: ${amount.toFixed(6)}`);
        } catch (error: any) {
          console.log(`  ${token.name}: Error - ${error.message}`);
        }
      }
    }
  } else {
    console.log("⚠️ No StarkNet deployments found");
  }
  
  // Check EVM balances
  console.log("\n--- EVM Token Balances (Base Sepolia) ---");
  
  if (deployments.evm?.base_sepolia) {
    try {
      const provider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
      
      const accounts = [
        { name: "Main User", key: process.env.PRIVATE_KEY },
        { name: "Resolver 0", key: process.env.RESOLVER_PRIVATE_KEY_0 },
        { name: "Resolver 1", key: process.env.RESOLVER_PRIVATE_KEY_1 },
      ];
      
      const tokens = [
        { name: "MockUSDT", address: deployments.evm.base_sepolia.MockUSDT, decimals: 6 },
        { name: "MockDAI", address: deployments.evm.base_sepolia.MockDAI, decimals: 18 },
      ];
      
      for (const account of accounts) {
        if (!account.key) continue;
        
        const wallet = new Wallet(account.key, provider);
        console.log(`\n${account.name} (${wallet.address}):`);
        
        // ETH balance
        const ethBalance = await provider.getBalance(wallet.address);
        console.log(`  ETH: ${(parseFloat(ethBalance.toString()) / 1e18).toFixed(6)}`);
        
        // Token balances
        for (const token of tokens) {
          if (!token.address) continue;
          
          try {
            const contract = new EthersContract(token.address, ERC20_ABI, provider);
            const balance = await contract.balanceOf(wallet.address);
            const amount = parseFloat(balance.toString()) / Math.pow(10, token.decimals);
            console.log(`  ${token.name}: ${amount.toFixed(6)}`);
          } catch (error: any) {
            console.log(`  ${token.name}: Error - ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      console.log(`❌ EVM Balance Check: ${error.message}`);
    }
  } else {
    console.log("⚠️ No EVM deployments found");
  }
  
  console.log("\n✅ Balance check completed");
}

if (require.main === module) {
  checkBalances().catch(console.error);
}

export default checkBalances;
