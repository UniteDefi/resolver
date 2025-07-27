import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function deployTokenAuction() {
  console.log("[Deploy] Deploying TokenDutchAuction contract to Base Sepolia...");

  // Setup provider
  const provider = new ethers.JsonRpcProvider(
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Setup deployer wallet
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  console.log(`[Deploy] Deployer: ${deployer.address}`);

  // Load TokenDutchAuction ABI and bytecode
  const tokenAuctionArtifact = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/TokenDutchAuction.sol/TokenDutchAuction.json"),
      "utf8"
    )
  );

  // Deploy TokenDutchAuction
  const TokenAuction = new ethers.ContractFactory(
    tokenAuctionArtifact.abi,
    tokenAuctionArtifact.bytecode,
    deployer
  );

  console.log("[Deploy] Deploying TokenDutchAuction...");
  const tokenAuction = await TokenAuction.deploy();
  await tokenAuction.waitForDeployment();

  const tokenAuctionAddress = await tokenAuction.getAddress();
  console.log(`[Deploy] TokenDutchAuction deployed at: ${tokenAuctionAddress}`);

  // Save deployment
  const deployments = {
    base_sepolia: {
      tokenDutchAuction: tokenAuctionAddress,
      deployer: deployer.address,
      timestamp: new Date().toISOString()
    }
  };

  fs.writeFileSync(
    path.join(process.cwd(), "auction_deployments.json"),
    JSON.stringify(deployments, null, 2)
  );

  console.log("[Deploy] Deployment saved to auction_deployments.json");
}

deployTokenAuction().catch(console.error);