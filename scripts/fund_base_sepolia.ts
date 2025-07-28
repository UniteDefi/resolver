import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

async function fundBaseSepoliaWallets() {
  const baseSepoliaProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
  
  const deployerWallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
  const baseDeployer = deployerWallet.connect(baseSepoliaProvider);
  
  const userAddress = new ethers.Wallet(process.env.USER_PRIVATE_KEY!).address;
  const resolverAddress = new ethers.Wallet(process.env.RESOLVER_PRIVATE_KEY!).address;
  
  const amountToSend = ethers.parseEther("0.1"); // 0.1 ETH each
  
  console.log("Funding wallets on Base Sepolia...\n");
  
  try {
    // Get current nonce
    const nonce = await baseDeployer.getNonce();
    console.log(`Current nonce: ${nonce}`);
    
    const tx1 = await baseDeployer.sendTransaction({
      to: userAddress,
      value: amountToSend,
      nonce: nonce
    });
    console.log(`User funding tx: ${tx1.hash}`);
    
    const tx2 = await baseDeployer.sendTransaction({
      to: resolverAddress,
      value: amountToSend,
      nonce: nonce + 1
    });
    console.log(`Resolver funding tx: ${tx2.hash}`);
    
    console.log("\nWaiting for confirmations...");
    await Promise.all([tx1.wait(), tx2.wait()]);
    
    console.log("\nBase Sepolia funding complete!");
  } catch (error) {
    console.error("Error funding wallets:", error);
  }
}

fundBaseSepoliaWallets().catch(console.error);