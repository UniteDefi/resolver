import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { BASE_CONFIG } from "../config";

interface DeploymentAddresses {
  htlcAddress: string;
  tokenAddress: string;
}

async function deployContracts(): Promise<DeploymentAddresses> {
  console.log("[Deploy/Base] Starting Base Sepolia contract deployment...");
  
  const provider = new ethers.JsonRpcProvider(BASE_CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(process.env.BASE_PRIVATE_KEY!, provider);
  
  console.log("[Deploy/Base] Deploying from:", wallet.address);
  
  // Deploy Mock ERC20 Token
  const tokenArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../contracts/MockERC20.json"),
      "utf8"
    )
  );
  
  console.log("[Deploy/Base] Deploying Mock ERC20 token...");
  const TokenContract = new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    wallet
  );
  
  const token = await TokenContract.deploy("Mock USDC", "mUSDC", 6);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("[Deploy/Base] Mock token deployed to:", tokenAddress);
  
  // Deploy HTLC Contract
  const htlcArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../contracts/HTLCEscrow.json"),
      "utf8"
    )
  );
  
  console.log("[Deploy/Base] Deploying HTLC Escrow contract...");
  const HTLCContract = new ethers.ContractFactory(
    htlcArtifact.abi,
    htlcArtifact.bytecode,
    wallet
  );
  
  const htlc = await HTLCContract.deploy();
  await htlc.waitForDeployment();
  const htlcAddress = await htlc.getAddress();
  console.log("[Deploy/Base] HTLC Escrow deployed to:", htlcAddress);
  
  // Mint some tokens for testing
  console.log("[Deploy/Base] Minting test tokens...");
  const mintTx = await token.mint(wallet.address, ethers.parseUnits("10000", 6));
  await mintTx.wait();
  
  console.log("[Deploy/Base] Deployment complete!");
  console.log("[Deploy/Base] Contracts deployed:");
  console.log(`  - Mock Token: ${tokenAddress}`);
  console.log(`  - HTLC Escrow: ${htlcAddress}`);
  
  // Save deployment addresses
  const addresses = {
    htlcAddress,
    tokenAddress,
  };
  
  fs.writeFileSync(
    path.join(__dirname, "../.deployed-addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  
  return addresses;
}

if (require.main === module) {
  deployContracts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[Deploy/Base] Error:", error);
      process.exit(1);
    });
}

export { deployContracts };