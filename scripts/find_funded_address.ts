import { ethers } from "ethers";

async function findFundedAddress() {
  // Possible addresses that might have been funded
  const possibleAddresses = [
    { name: "Hardhat #0", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
    { name: "Hardhat #1", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
    { name: "Hardhat #2", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
    { name: "Hardhat #3", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
    { name: "Hardhat #4", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" },
    { name: "Hardhat #5", address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" },
    { name: "Hardhat #6", address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" },
    { name: "Hardhat #7", address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" },
    { name: "Hardhat #8", address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" },
    { name: "Hardhat #9", address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" }
  ];
  
  console.log("[FindFundedAddress] Checking for funded addresses...\n");
  
  const sepoliaProvider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
  const baseSepoliaProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  
  for (const { name, address } of possibleAddresses) {
    const sepoliaBalance = await sepoliaProvider.getBalance(address);
    const baseSepoliaBalance = await baseSepoliaProvider.getBalance(address);
    
    if (sepoliaBalance > 0n || baseSepoliaBalance > 0n) {
      console.log(`✅ ${name} (${address}):`);
      console.log(`   Sepolia: ${ethers.formatEther(sepoliaBalance)} ETH`);
      console.log(`   Base Sepolia: ${ethers.formatEther(baseSepoliaBalance)} ETH`);
    }
  }
  
  console.log("\n💡 Please update the DEPLOYER_PRIVATE_KEY in .env with the private key of the funded address.");
  console.log("Private keys for Hardhat accounts:");
  console.log("Account #0: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  console.log("Account #1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  console.log("Account #2: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
}

findFundedAddress().catch(console.error);