import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function deployCrossChainAuction() {
  console.log("[Deploy] Deploying CrossChainTokenAuction contract to Base Sepolia...");

  // Setup provider
  const provider = new ethers.JsonRpcProvider(
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Setup deployer wallet
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  console.log(`[Deploy] Deployer: ${deployer.address}`);

  // Load CrossChainTokenAuction ABI and bytecode
  const auctionArtifact = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/CrossChainTokenAuction.sol/CrossChainTokenAuction.json"),
      "utf8"
    )
  );

  // Deploy CrossChainTokenAuction
  const Auction = new ethers.ContractFactory(
    auctionArtifact.abi,
    auctionArtifact.bytecode,
    deployer
  );

  console.log("[Deploy] Deploying CrossChainTokenAuction...");
  const auction = await Auction.deploy();
  await auction.waitForDeployment();

  const auctionAddress = await auction.getAddress();
  console.log(`[Deploy] CrossChainTokenAuction deployed at: ${auctionAddress}`);

  // Update deployment file
  let deployments: any = {};
  try {
    deployments = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "auction_deployments.json"), "utf8")
    );
  } catch (e) {
    // File doesn't exist yet
  }

  deployments.base_sepolia = {
    ...deployments.base_sepolia,
    crossChainTokenAuction: auctionAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(process.cwd(), "auction_deployments.json"),
    JSON.stringify(deployments, null, 2)
  );

  console.log("[Deploy] Deployment saved to auction_deployments.json");
}

deployCrossChainAuction().catch(console.error);