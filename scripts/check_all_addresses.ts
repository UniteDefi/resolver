import { ethers } from "ethers";

async function checkAllAddresses() {
  // Common test addresses and their private keys
  const testAccounts = [
    { 
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      name: "Hardhat #0"
    },
    {
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      name: "Hardhat #1"
    },
    {
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
      name: "Hardhat #2"
    }
  ];
  
  console.log("[CheckAllAddresses] Searching for funded accounts...\n");
  
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  let fundedAccount = null;
  
  for (const account of testAccounts) {
    const sepoliaBalance = await sepoliaProvider.getBalance(account.address);
    const baseSepoliaBalance = await baseSepoliaProvider.getBalance(account.address);
    
    console.log(`${account.name} (${account.address}):`);
    console.log(`  Sepolia: ${ethers.formatEther(sepoliaBalance)} ETH`);
    console.log(`  Base Sepolia: ${ethers.formatEther(baseSepoliaBalance)} ETH`);
    
    if (sepoliaBalance > ethers.parseEther("0.1") && baseSepoliaBalance > ethers.parseEther("0.1")) {
      fundedAccount = account;
      console.log(`  ✅ This account has sufficient funds!`);
    }
    console.log("");
  }
  
  if (fundedAccount) {
    console.log("\n🎉 Found funded account!");
    console.log("Address:", fundedAccount.address);
    console.log("Private Key:", fundedAccount.privateKey);
    console.log("\nUpdate your .env file with:");
    console.log(`DEPLOYER_PRIVATE_KEY=${fundedAccount.privateKey}`);
    return fundedAccount;
  } else {
    console.log("❌ No account found with 0.2 ETH on both networks");
    console.log("\nTrying alternative addresses...");
    
    // Check some other common addresses
    const otherAddresses = [
      "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
    ];
    
    for (const address of otherAddresses) {
      const sepoliaBalance = await sepoliaProvider.getBalance(address);
      const baseSepoliaBalance = await baseSepoliaProvider.getBalance(address);
      
      if (sepoliaBalance > 0n || baseSepoliaBalance > 0n) {
        console.log(`\n${address}:`);
        console.log(`  Sepolia: ${ethers.formatEther(sepoliaBalance)} ETH`);
        console.log(`  Base Sepolia: ${ethers.formatEther(baseSepoliaBalance)} ETH`);
      }
    }
  }
}

checkAllAddresses().catch(console.error);