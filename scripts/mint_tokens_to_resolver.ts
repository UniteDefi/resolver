import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function main() {
  console.log("[Mint] Minting tokens to resolver...");

  const tokenDeployments = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "crosschain_deployments.json"), "utf8")
  );

  // Setup providers
  const ethProvider = new ethers.JsonRpcProvider(
    `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );
  const baseProvider = new ethers.JsonRpcProvider(
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );

  // Deployer wallet (owner of mock tokens)
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY!);
  const resolver = deployer.address; // Using deployer as resolver

  console.log(`[Mint] Resolver address: ${resolver}`);

  // Load token ABI
  const tokenAbi = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "dist/contracts/MockToken.sol/MockToken.json"),
      "utf8"
    )
  ).abi;

  // Mint on Ethereum Sepolia
  const ethUsdc = new ethers.Contract(
    tokenDeployments.ethereum_sepolia.mockUSDT,
    tokenAbi,
    deployer.connect(ethProvider)
  );

  console.log("\n[Mint] Minting 1000 USDC to resolver on Ethereum...");
  const ethMintTx = await ethUsdc.mint(resolver, ethers.parseUnits("1000", 6));
  await ethMintTx.wait();
  console.log(`[Mint] Success! TX: ${ethMintTx.hash}`);

  // Mint on Base Sepolia
  const baseUsdc = new ethers.Contract(
    tokenDeployments.base_sepolia.mockUSDT,
    tokenAbi,
    deployer.connect(baseProvider)
  );

  console.log("\n[Mint] Minting 1000 USDC to resolver on Base...");
  const baseMintTx = await baseUsdc.mint(resolver, ethers.parseUnits("1000", 6));
  await baseMintTx.wait();
  console.log(`[Mint] Success! TX: ${baseMintTx.hash}`);

  // Check balances
  const ethBalance = await ethUsdc.balanceOf(resolver);
  const baseBalance = await baseUsdc.balanceOf(resolver);

  console.log("\n[Mint] Resolver balances:");
  console.log(`  Ethereum: ${ethers.formatUnits(ethBalance, 6)} USDC`);
  console.log(`  Base: ${ethers.formatUnits(baseBalance, 6)} USDC`);
}

main().catch(console.error);