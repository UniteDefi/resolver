import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function main() {
  console.log("[Setup] Setting up resolver ownership...");

  const escrowDeployments = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "escrow_deployments.json"), "utf8")
  );

  // Setup providers
  const ethProvider = new ethers.JsonRpcProvider(
    `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );
  const baseProvider = new ethers.JsonRpcProvider(
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Deployer wallet (current owner)
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!, ethProvider);
  const resolver = new ethers.Wallet(process.env.RESOLVER1_WALLET_PRIVATE_KEY!);

  console.log(`[Setup] Current owner: ${deployer.address}`);
  console.log(`[Setup] New owner (resolver): ${resolver.address}`);

  // Load Resolver ABI
  const resolverAbi = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/Resolver.sol/Resolver.json"),
      "utf8"
    )
  ).abi;

  // Transfer ownership on Ethereum
  console.log("\n[Setup] Transferring ownership on Ethereum Sepolia...");
  const ethResolver = new ethers.Contract(
    escrowDeployments.ethereum_sepolia.resolver,
    resolverAbi,
    deployer
  );

  const ethTransferTx = await ethResolver.transferOwnership(resolver.address);
  await ethTransferTx.wait();
  console.log(`[Setup] ✅ Ownership transferred! TX: ${ethTransferTx.hash}`);

  // Transfer ownership on Base
  console.log("\n[Setup] Transferring ownership on Base Sepolia...");
  const baseResolver = new ethers.Contract(
    escrowDeployments.base_sepolia.resolver,
    resolverAbi,
    deployer.connect(baseProvider)
  );

  const baseTransferTx = await baseResolver.transferOwnership(resolver.address);
  await baseTransferTx.wait();
  console.log(`[Setup] ✅ Ownership transferred! TX: ${baseTransferTx.hash}`);

  console.log("\n[Setup] Resolver contracts are now owned by the resolver wallet!");
}

main().catch(console.error);