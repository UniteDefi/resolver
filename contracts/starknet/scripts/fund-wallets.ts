import { Account, RpcProvider, Contract, CallData, uint256 } from "starknet";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function fundWallets() {
  console.log("💰 Starting wallet funding...");
  
  const provider = new RpcProvider({ 
    nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  const deployerAddress = process.env.STARKNET_ACCOUNT_ADDRESS!;
  const deployerPrivateKey = process.env.STARKNET_PRIVATE_KEY!;
  
  if (!deployerAddress || !deployerPrivateKey) {
    throw new Error("Missing STARKNET_ACCOUNT_ADDRESS or STARKNET_PRIVATE_KEY");
  }
  
  const deployerAccount = new Account(provider, deployerAddress, deployerPrivateKey);
  
  // Read deployments
  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("deployments.json not found. Run deployment first.");
  }
  
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const starknetDeployments = deployments.starknet;
  
  if (!starknetDeployments) {
    throw new Error("Starknet deployments not found in deployments.json");
  }
  
  // Get wallet addresses
  const userWallet = process.env.STARKNET_USER_ADDRESS || deployerAddress;
  const resolver0Wallet = process.env.STARKNET_RESOLVER_WALLET_0 || deployerAddress;
  const resolver1Wallet = process.env.STARKNET_RESOLVER_WALLET_1 || deployerAddress;
  const resolver2Wallet = process.env.STARKNET_RESOLVER_WALLET_2 || deployerAddress;
  const resolver3Wallet = process.env.STARKNET_RESOLVER_WALLET_3 || deployerAddress;
  
  const wallets = [
    { name: "User", address: userWallet },
    { name: "Resolver0", address: resolver0Wallet },
    { name: "Resolver1", address: resolver1Wallet },
    { name: "Resolver2", address: resolver2Wallet },
    { name: "Resolver3", address: resolver3Wallet }
  ];
  
  console.log("📋 Funding Configuration:");
  console.log("- Deployer:", deployerAddress);
  console.log("- User Wallet:", userWallet);
  console.log("- Resolver0 Wallet:", resolver0Wallet);
  console.log("- Resolver1 Wallet:", resolver1Wallet);
  console.log("- Resolver2 Wallet:", resolver2Wallet);
  console.log("- Resolver3 Wallet:", resolver3Wallet);
  
  // Check deployer balance
  const deployerBalance = await provider.getBalance(deployerAddress);
  console.log("- Deployer Balance:", uint256.uint256ToBN(deployerBalance).toString(), "wei");
  
  try {
    // 1. Fund wallets with ETH (if different from deployer)
    console.log("\n💸 Funding wallets with ETH...");
    
    const ethAmountToSend = uint256.bnToUint256("100000000000000000"); // 0.1 ETH in wei
    
    for (const wallet of wallets) {
      if (wallet.address !== deployerAddress) {
        console.log(`   Sending 0.1 ETH to ${wallet.name} (${wallet.address})...`);
        
        try {
          const transferCall = {
            contractAddress: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH contract
            entrypoint: "transfer",
            calldata: CallData.compile([wallet.address, ethAmountToSend])
          };
          
          const { transaction_hash } = await deployerAccount.execute(transferCall);
          await deployerAccount.waitForTransaction(transaction_hash);
          
          console.log(`   ✅ Sent ETH to ${wallet.name}`);
        } catch (error) {
          console.log(`   ⚠️ Failed to send ETH to ${wallet.name}:`, error);
        }
      }
    }
    
    // 2. Mint tokens to all wallets
    console.log("\n🪙 Minting tokens to wallets...");
    
    const tokenAmount = uint256.bnToUint256("10000000000"); // 10,000 tokens (6 decimals)
    
    // Mint USDT
    if (starknetDeployments.contracts.MockUSDT) {
      console.log("   Minting USDT...");
      const usdtContract = new Contract(
        [], // ABI will be loaded from compiled contract
        starknetDeployments.contracts.MockUSDT.address,
        deployerAccount
      );
      
      for (const wallet of wallets) {
        try {
          const mintCall = {
            contractAddress: starknetDeployments.contracts.MockUSDT.address,
            entrypoint: "mint",
            calldata: CallData.compile([wallet.address, tokenAmount])
          };
          
          const { transaction_hash } = await deployerAccount.execute(mintCall);
          await deployerAccount.waitForTransaction(transaction_hash);
          
          console.log(`   ✅ Minted 10,000 USDT (6 decimals) to ${wallet.name}`);
        } catch (error) {
          console.log(`   ⚠️ Failed to mint USDT to ${wallet.name}:`, error);
        }
      }
    }
    
    // Mint DAI
    if (starknetDeployments.contracts.MockDAI) {
      console.log("   Minting DAI...");
      
      for (const wallet of wallets) {
        try {
          const mintCall = {
            contractAddress: starknetDeployments.contracts.MockDAI.address,
            entrypoint: "mint",
            calldata: CallData.compile([wallet.address, tokenAmount])
          };
          
          const { transaction_hash } = await deployerAccount.execute(mintCall);
          await deployerAccount.waitForTransaction(transaction_hash);
          
          console.log(`   ✅ Minted 10,000 DAI (6 decimals) to ${wallet.name}`);
        } catch (error) {
          console.log(`   ⚠️ Failed to mint DAI to ${wallet.name}:`, error);
        }
      }
    }
    
    // 3. Pre-approve tokens for resolvers
    console.log("\n🔓 Setting up token approvals for resolvers...");
    
    const resolverWallets = [
      { address: resolver0Wallet, resolverContract: starknetDeployments.contracts.UniteResolver0?.address },
      { address: resolver1Wallet, resolverContract: starknetDeployments.contracts.UniteResolver1?.address },
      { address: resolver2Wallet, resolverContract: starknetDeployments.contracts.UniteResolver2?.address },
      { address: resolver3Wallet, resolverContract: starknetDeployments.contracts.UniteResolver3?.address }
    ];
    
    const approvalAmount = uint256.bnToUint256("1000000000000000000000000"); // Large approval amount
    
    for (const resolver of resolverWallets) {
      if (resolver.resolverContract && resolver.address !== deployerAddress) {
        console.log(`   Setting up approvals for resolver at ${resolver.address}...`);
        
        // Note: In a real implementation, you'd need the resolver's private key
        // For now, we'll just log what needs to be done
        console.log(`   ⚠️ Manual action required: Resolver needs to approve tokens to their resolver contract`);
        console.log(`      - Approve USDT: ${starknetDeployments.contracts.MockUSDT?.address}`);
        console.log(`      - Approve DAI: ${starknetDeployments.contracts.MockDAI?.address}`);
        console.log(`      - Spender: ${resolver.resolverContract}`);
        console.log(`      - Amount: ${approvalAmount.low.toString()}`);
      }
    }
    
    console.log("\n✅ WALLET FUNDING COMPLETE!");
    console.log("💡 Summary:");
    console.log("- All wallets funded with 0.1 ETH (if different from deployer)");
    console.log("- All wallets received 10,000 USDT and 10,000 DAI (6 decimals each)");
    console.log("- Resolver approvals need to be set manually by resolver owners");
    
  } catch (error) {
    console.error("❌ Funding failed:", error);
    throw error;
  }
}

if (require.main === module) {
  fundWallets().catch(console.error);
}

export default fundWallets;