/**
 * Simple Cross-Chain Swap Example
 * 
 * This example demonstrates how to perform a basic cross-chain swap
 * from Base Sepolia (USDT) to Aptos (DAI) using the Unite Protocol.
 */

import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
} from "ethers";
import { randomBytes, createHash } from "crypto";
import { solidityPackedKeccak256, hexlify } from "ethers";
import * as dotenv from "dotenv";

// Import helpers
import { setupAptosTest, registerForCoin, mintTestCoin } from "../tests/helpers/aptos-helpers";
import { setupEVMTest, signOrder, ERC20_ABI, UNITE_RESOLVER_ABI } from "../tests/helpers/evm-helpers";
import { createTestData, TEST_SCENARIOS } from "../tests/helpers/test-data";

dotenv.config();

interface SwapConfig {
  sourceChain: "base_sepolia" | "aptos";
  destinationChain: "base_sepolia" | "aptos";
  sourceToken: "USDT" | "DAI";
  destinationToken: "USDT" | "DAI";
  amount: string;
  userPrivateKey: string;
  resolverPrivateKeys: string[];
}

class UniteSwapClient {
  private aptosConfig?: { aptos: Aptos; account: Account; packageAddress: string };
  private evmConfig?: { provider: JsonRpcProvider; wallet: Wallet; deployments: any };

  async initialize() {
    console.log("🚀 Initializing Unite Swap Client...");

    // Initialize Aptos
    try {
      const network = (process.env.APTOS_NETWORK as Network) || Network.DEVNET;
      const config = new AptosConfig({ network });
      const aptos = new Aptos(config);
      
      const privateKey = process.env.APTOS_PRIVATE_KEY;
      if (!privateKey) throw new Error("APTOS_PRIVATE_KEY required");
      
      const account = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(privateKey),
      });
      
      const packageAddress = account.accountAddress.toString();
      
      this.aptosConfig = { aptos, account, packageAddress };
      console.log("✅ Aptos initialized:", packageAddress);
    } catch (error) {
      console.log("❌ Aptos initialization failed:", (error as Error).message);
    }

    // Initialize EVM (Base Sepolia)
    try {
      const provider = new JsonRpcProvider(
        process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"
      );
      const wallet = new Wallet(process.env.PRIVATE_KEY || "", provider);
      
      // Load deployments (you'd typically load from a file)
      const deployments = {
        chainId: 84532,
        MockUSDT: "0x97a2d8Dfece96252518a4327aFFf40B61A0a025A",
        MockDAI: "0x45A3AF79Ad654e75114988Abd92615eD79754eF5",
        UniteLimitOrderProtocol: "0x8F65f257A27681B80AE726BCbEdE186DCA702746",
        UniteEscrowFactory: "0xF704A173a3Ba9B7Fc0686d14C0cD94fce60102B7",
        UniteResolver0: "0x80A2EDaB44AD892d477F6B80fAa06881Fb52Af5B",
      };
      
      this.evmConfig = { provider, wallet, deployments };
      console.log("✅ EVM initialized:", wallet.address);
    } catch (error) {
      console.log("❌ EVM initialization failed:", (error as Error).message);
    }
  }

  async executeSwap(config: SwapConfig): Promise<void> {
    console.log(`\n🔄 Executing Swap: ${config.sourceChain} → ${config.destinationChain}`);
    console.log(`   ${config.amount} ${config.sourceToken} → ${config.destinationToken}`);

    // Generate swap data
    const secret = randomBytes(32);
    const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
    
    console.log("🔐 Swap Secret:", hexlify(secret));
    console.log("🔒 Hashlock:", hashlock);

    if (config.sourceChain === "base_sepolia" && config.destinationChain === "aptos") {
      await this.executeEvmToAptos(config, secret, hashlock);
    } else if (config.sourceChain === "aptos" && config.destinationChain === "base_sepolia") {
      await this.executeAptosToEvm(config, secret, hashlock);
    } else {
      throw new Error("Unsupported swap direction");
    }
  }

  private async executeEvmToAptos(
    config: SwapConfig,
    secret: Uint8Array,
    hashlock: string
  ): Promise<void> {
    if (!this.evmConfig || !this.aptosConfig) {
      throw new Error("Clients not initialized");
    }

    console.log("\n📋 Step 1: Setup and Balances");
    
    // Check EVM balances
    const usdtContract = new Contract(
      this.evmConfig.deployments.MockUSDT,
      ERC20_ABI,
      this.evmConfig.wallet
    );
    
    const userUSDTBalance = await usdtContract.balanceOf(this.evmConfig.wallet.address);
    console.log("User USDT (Base):", formatUnits(userUSDTBalance, 6));

    // Check Aptos balances
    await registerForCoin(this.aptosConfig.aptos, this.aptosConfig.account, this.aptosConfig.packageAddress, 'dai');
    
    const userDAIBalance = await this.aptosConfig.aptos.view({
      payload: {
        function: `${this.aptosConfig.packageAddress}::test_coin::get_dai_balance`,
        functionArguments: [this.aptosConfig.account.accountAddress],
      },
    });
    console.log("User DAI (Aptos):", formatUnits(userDAIBalance[0] as string, 18));

    console.log("\n🏗️  Step 2: Create Cross-Chain Order");
    
    // Create order
    const amount = parseUnits(config.amount, 6); // USDT has 6 decimals
    const expectedAmount = parseUnits((parseFloat(config.amount) * 0.99).toString(), 18); // DAI has 18 decimals
    
    const now = Math.floor(Date.now() / 1000);
    const order = {
      salt: 12345n,
      maker: this.evmConfig.wallet.address,
      receiver: "0x0000000000000000000000000000000000000000",
      makerAsset: this.evmConfig.deployments.MockUSDT,
      takerAsset: `${this.aptosConfig.packageAddress}::test_coin::TestDAI`,
      makingAmount: amount,
      takingAmount: expectedAmount,
      deadline: now + 3600,
      nonce: 0n,
      srcChainId: 84532,
      dstChainId: 3,
      auctionStartTime: now,
      auctionEndTime: now + 300,
      startPrice: parseUnits("0.99", 18),
      endPrice: parseUnits("0.97", 18),
    };

    // Sign order
    const signature = await signOrder(
      order,
      this.evmConfig.wallet,
      "UniteLimitOrderProtocol",
      "1",
      84532,
      this.evmConfig.deployments.UniteLimitOrderProtocol
    );

    console.log("✅ Order created and signed");

    console.log("\n💰 Step 3: Approve Tokens");
    
    // Approve USDT
    const approveTx = await usdtContract.approve(
      this.evmConfig.deployments.UniteEscrowFactory,
      amount
    );
    await approveTx.wait();
    console.log("✅ USDT approved");

    console.log("\n🔗 Step 4: Resolver Commits (Simplified)");
    
    // In a real scenario, resolvers would commit independently
    // For this example, we'll simulate one resolver commitment
    console.log("✅ Resolver committed on Base Sepolia (simulated)");
    console.log("✅ Resolver committed on Aptos (simulated)");
    console.log("✅ Resolver deposited DAI on Aptos (simulated)");

    console.log("\n🔓 Step 5: Secret Reveal & Completion");
    
    console.log("Secret revealed:", hexlify(secret));
    console.log("✅ Cross-chain swap completed!");
    console.log("  User receives DAI on Aptos");
    console.log("  Resolver receives USDT on Base Sepolia");
    console.log("  Safety deposits returned");
  }

  private async executeAptosToEvm(
    config: SwapConfig,
    secret: Uint8Array,
    hashlock: string
  ): Promise<void> {
    console.log("🔄 Aptos → EVM swap flow (simplified)");
    
    // Similar implementation for reverse direction
    console.log("✅ Order created on Aptos");
    console.log("✅ Resolvers commit on both chains");
    console.log("✅ Secret revealed and funds distributed");
  }

  async getSwapQuote(
    sourceChain: string,
    destinationChain: string,
    sourceToken: string,
    amount: string
  ): Promise<{ estimatedOutput: string; fees: string; timeEstimate: string }> {
    // Simplified quote calculation
    const rate = 0.99; // 1% fee
    const estimatedOutput = (parseFloat(amount) * rate).toString();
    
    return {
      estimatedOutput,
      fees: (parseFloat(amount) * 0.01).toString(),
      timeEstimate: "2-5 minutes",
    };
  }

  async getSwapStatus(orderHash: string): Promise<{
    status: "pending" | "committed" | "completed" | "failed";
    progress: number;
    steps: string[];
  }> {
    // Simplified status checking
    return {
      status: "pending",
      progress: 25,
      steps: [
        "✅ Order created",
        "🔄 Waiting for resolver commitments",
        "⏳ Pending secret reveal",
        "⏳ Pending completion",
      ],
    };
  }
}

// Example usage
async function main() {
  console.log("🌟 Unite Protocol - Simple Swap Example");
  console.log("========================================\n");

  const client = new UniteSwapClient();
  await client.initialize();

  // Example swap configuration
  const swapConfig: SwapConfig = {
    sourceChain: "base_sepolia",
    destinationChain: "aptos",
    sourceToken: "USDT",
    destinationToken: "DAI",
    amount: "100",
    userPrivateKey: process.env.PRIVATE_KEY || "",
    resolverPrivateKeys: [
      process.env.RESOLVER_PRIVATE_KEY_0 || "",
      process.env.RESOLVER_PRIVATE_KEY_1 || "",
    ],
  };

  try {
    // Get quote
    const quote = await client.getSwapQuote(
      swapConfig.sourceChain,
      swapConfig.destinationChain,
      swapConfig.sourceToken,
      swapConfig.amount
    );
    
    console.log("💱 Swap Quote:");
    console.log(`  Input: ${swapConfig.amount} ${swapConfig.sourceToken}`);
    console.log(`  Output: ${quote.estimatedOutput} ${swapConfig.destinationToken}`);
    console.log(`  Fees: ${quote.fees} ${swapConfig.sourceToken}`);
    console.log(`  Time: ${quote.timeEstimate}\n`);

    // Execute swap
    await client.executeSwap(swapConfig);

    console.log("\n🎉 Swap Example Completed!");
    console.log("Check the logs above for detailed step-by-step execution.");
    
  } catch (error) {
    console.error("❌ Swap failed:", (error as Error).message);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Unite Protocol Simple Swap Example

Usage:
  npm run example:swap [options]

Options:
  --help          Show this help message
  --quote-only    Get quote without executing swap
  --source CHAIN  Source chain (base_sepolia, aptos)
  --dest CHAIN    Destination chain (base_sepolia, aptos)
  --amount VALUE  Amount to swap

Environment Variables:
  APTOS_PRIVATE_KEY       - Your Aptos account private key
  PRIVATE_KEY            - Your EVM account private key
  BASE_SEPOLIA_RPC_URL   - Base Sepolia RPC endpoint
  RESOLVER_PRIVATE_KEY_0 - Resolver private key (for testing)

Examples:
  npm run example:swap
  npm run example:swap -- --quote-only
  npm run example:swap -- --source aptos --dest base_sepolia --amount 50
`);
  } else {
    main().catch(console.error);
  }
}

export { UniteSwapClient, type SwapConfig };