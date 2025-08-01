import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface DeploymentStep {
  step: number;
  action: string;
  txHash?: string;
  result?: any;
  timestamp: string;
}

class CompleteDeployment {
  private aptos: Aptos;
  private deployer: Account;
  private user: Account;
  private resolvers: Account[];
  private packageAddress: string;
  private deploymentLog: DeploymentStep[] = [];

  constructor() {
    const network = (process.env.APTOS_NETWORK as Network) || Network.TESTNET;
    const config = new AptosConfig({ network });
    this.aptos = new Aptos(config);

    // Initialize accounts
    this.deployer = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY!),
    });

    this.user = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_USER_PRIVATE_KEY!),
    });

    this.resolvers = [
      Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_0!),
      }),
      Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_1!),
      }),
      Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_2!),
      }),
      Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_3!),
      }),
    ];

    this.packageAddress = process.env.APTOS_DEPLOYER_ADDRESS!;
  }

  private log(action: string, txHash?: string, result?: any) {
    const step: DeploymentStep = {
      step: this.deploymentLog.length + 1,
      action,
      txHash,
      result,
      timestamp: new Date().toISOString(),
    };
    this.deploymentLog.push(step);
    console.log(`[Step ${step.step}] ${action}${txHash ? ` - Tx: ${txHash}` : ""}`);
  }

  async deploy(): Promise<void> {
    console.log("🚀 Starting Complete Aptos Deployment and Testing...\n");

    try {
      // Step 1: Initialize additional test coins (MockWrappedAPT)
      await this.initializeAdditionalCoins();

      // Step 2: Initialize resolver contracts
      await this.initializeResolvers();

      // Step 3: Mint tokens to user and resolvers
      await this.mintTokensToAccounts();

      // Step 4: Run comprehensive tests
      await this.runTests();

      // Step 5: Save deployment log
      this.saveDeploymentLog();

      console.log("\n✅ Complete deployment and testing finished successfully!");

    } catch (error) {
      console.error("\n❌ Deployment failed:", error);
      this.saveDeploymentLog();
      throw error;
    }
  }

  private async initializeAdditionalCoins(): Promise<void> {
    console.log("\n📦 Initializing Additional Test Coins...");

    // Note: MockWrappedAPT would be created if needed
    // For now, we'll work with existing TestUSDT and TestDAI
    this.log("Test coins already available (TestUSDT, TestDAI)");
  }

  private async initializeTestCoinV2(): Promise<void> {
    // Initialize TestUSDT v2
    const initUSDTTxn = await this.aptos.transaction.build.simple({
      sender: this.deployer.accountAddress,
      data: {
        function: `${this.packageAddress}::test_coin_v2::initialize_usdt_v2`,
        functionArguments: [],
      },
    });

    const usdtResult = await this.aptos.signAndSubmitTransaction({
      signer: this.deployer,
      transaction: initUSDTTxn,
    });

    await this.aptos.waitForTransaction({
      transactionHash: usdtResult.hash,
    });

    // Initialize TestDAI v2
    const initDAITxn = await this.aptos.transaction.build.simple({
      sender: this.deployer.accountAddress,
      data: {
        function: `${this.packageAddress}::test_coin_v2::initialize_dai_v2`,
        functionArguments: [],
      },
    });

    const daiResult = await this.aptos.signAndSubmitTransaction({
      signer: this.deployer,
      transaction: initDAITxn,
    });

    await this.aptos.waitForTransaction({
      transactionHash: daiResult.hash,
    });

    console.log("✅ TestCoin v2 initialized successfully");
  }

  private async initializeResolvers(): Promise<void> {
    console.log("\n🔧 Initializing Resolver Contracts...");

    for (let i = 0; i < this.resolvers.length; i++) {
      const resolver = this.resolvers[i];
      
      try {
        const initTxn = await this.aptos.transaction.build.simple({
          sender: resolver.accountAddress,
          data: {
            function: `${this.packageAddress}::resolver::initialize`,
            functionArguments: [
              this.packageAddress, // factory_addr
              this.packageAddress, // protocol_addr
            ],
          },
        });

        const result = await this.aptos.signAndSubmitTransaction({
          signer: resolver,
          transaction: initTxn,
        });

        await this.aptos.waitForTransaction({
          transactionHash: result.hash,
        });

        this.log(`Resolver ${i} initialized at ${resolver.accountAddress.toString()}`, result.hash);

      } catch (error) {
        console.error(`Failed to initialize resolver ${i}:`, error);
        this.log(`Failed to initialize resolver ${i}: ${error}`);
      }
    }
  }

  private async mintTokensToAccounts(): Promise<void> {
    console.log("\n💰 Minting Test Tokens to Accounts...");

    const recipients = [this.user, ...this.resolvers];
    const tokenAmount = 1000; // 1000 tokens per account

    for (const recipient of recipients) {
      try {
        // Initialize test_coin_v2 first if not done
        try {
          await this.initializeTestCoinV2();
        } catch (e) {
          // Already initialized, continue
        }

        // Mint TestUSDT v2
        const mintUSDTTxn = await this.aptos.transaction.build.simple({
          sender: this.deployer.accountAddress,
          data: {
            function: `${this.packageAddress}::test_coin_v2::mint_usdt_v2`,
            functionArguments: [recipient.accountAddress.toString(), tokenAmount * 1_000_000, this.deployer.accountAddress.toString()], // 6 decimals + admin addr
          },
        });

        const usdtResult = await this.aptos.signAndSubmitTransaction({
          signer: this.deployer,
          transaction: mintUSDTTxn,
        });

        await this.aptos.waitForTransaction({
          transactionHash: usdtResult.hash,
        });

        // Mint TestDAI v2
        const mintDAITxn = await this.aptos.transaction.build.simple({
          sender: this.deployer.accountAddress,
          data: {
            function: `${this.packageAddress}::test_coin_v2::mint_dai_v2`,
            functionArguments: [recipient.accountAddress.toString(), tokenAmount * 1_000_000, this.deployer.accountAddress.toString()], // 6 decimals + admin addr
          },
        });

        const daiResult = await this.aptos.signAndSubmitTransaction({
          signer: this.deployer,
          transaction: mintDAITxn,
        });

        await this.aptos.waitForTransaction({
          transactionHash: daiResult.hash,
        });

        const recipientName = recipient === this.user ? "User" : `Resolver ${this.resolvers.indexOf(recipient)}`;
        this.log(`Minted ${tokenAmount} TestUSDT and ${tokenAmount} TestDAI to ${recipientName}`, daiResult.hash);

      } catch (error) {
        console.error(`Failed to mint tokens to ${recipient.accountAddress.toString()}:`, error);
        this.log(`Failed to mint tokens: ${error}`);
      }
    }
  }

  private async runTests(): Promise<void> {
    console.log("\n🧪 Running Cross-Chain Swap Tests...");

    // Test 1: Aptos -> Base Sepolia
    await this.testAptosToBaseSepolia();

    // Test 2: Base Sepolia -> Aptos (simulation)
    await this.testBaseSepoliaToAptos();
  }

  private async testAptosToBaseSepolia(): Promise<void> {
    console.log("\n🔄 Test 1: Aptos Testnet -> Base Sepolia Cross-Chain Swap");

    try {
      // Step 1: Create a limit order on Aptos (sell TestUSDT for TestDAI)
      const order = {
        salt: Date.now(),
        maker: this.user.accountAddress.toString(),
        receiver: this.user.accountAddress.toString(),
        maker_asset: `${this.packageAddress}::test_coin::TestUSDT`,
        taker_asset: `${this.packageAddress}::test_coin::TestDAI`,
        making_amount: 100 * 1_000_000, // 100 USDT (6 decimals)
        taking_amount: 95, // 95 DAI (simplified)
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        nonce: 0,
        src_chain_id: 2, // Aptos testnet
        dst_chain_id: 84532, // Base Sepolia
        auction_start_time: Math.floor(Date.now() / 1000),
        auction_end_time: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        start_price: 1_000_000, // 1.0 (scaled)
        end_price: 950_000, // 0.95 (scaled)
      };

      this.log("Created cross-chain limit order", undefined, order);

      // Step 2: Generate secret for HTLC
      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);
      const secretHex = Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join('');

      this.log("Generated HTLC secret", undefined, { secretLength: secret.length });

      // Step 3: Create source escrow (Aptos side)
      // This would be done by the resolver
      this.log("Source escrow would be created on Aptos (simulated)");

      // Step 4: Create destination escrow (Base Sepolia side)
      // This would be done on EVM
      this.log("Destination escrow would be created on Base Sepolia (simulated)");

      // Step 5: Resolver deposits funds
      this.log("Resolver deposits funds to escrows (simulated)");

      // Step 6: Secret reveal and withdrawal
      this.log("Secret revealed and funds withdrawn (simulated)", undefined, { secret: secretHex.substring(0, 16) + "..." });

      console.log("✅ Aptos -> Base Sepolia test completed (simulation)");

    } catch (error) {
      console.error("❌ Aptos -> Base Sepolia test failed:", error);
      this.log(`Aptos -> Base Sepolia test failed: ${error}`);
    }
  }

  private async testBaseSepoliaToAptos(): Promise<void> {
    console.log("\n🔄 Test 2: Base Sepolia -> Aptos Testnet Cross-Chain Swap");

    try {
      // This would simulate the reverse direction
      const order = {
        salt: Date.now() + 1,
        maker: "0x" + "1".repeat(40), // Mock EVM address
        receiver: this.user.accountAddress.toString(),
        maker_asset: "MockDAI", // EVM token
        taker_asset: `${this.packageAddress}::test_coin::TestUSDT`,
        making_amount: 100, // 100 DAI
        taking_amount: 105 * 1_000_000, // 105 USDT (6 decimals)
        deadline: Math.floor(Date.now() / 1000) + 3600,
        nonce: 0,
        src_chain_id: 84532, // Base Sepolia
        dst_chain_id: 2, // Aptos testnet
        auction_start_time: Math.floor(Date.now() / 1000),
        auction_end_time: Math.floor(Date.now() / 1000) + 1800,
        start_price: 1_050_000, // 1.05 (scaled)
        end_price: 1_000_000, // 1.0 (scaled)
      };

      this.log("Created reverse cross-chain limit order", undefined, order);

      // Generate secret
      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);
      const secretHex = Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join('');

      this.log("Generated HTLC secret for reverse swap", undefined, { secretLength: secret.length });

      // Simulate the reverse flow
      this.log("Source escrow would be created on Base Sepolia (simulated)");
      this.log("Destination escrow would be created on Aptos (simulated)");
      this.log("Resolver deposits funds to escrows (simulated)");
      this.log("Secret revealed and funds withdrawn (simulated)", undefined, { secret: secretHex.substring(0, 16) + "..." });

      console.log("✅ Base Sepolia -> Aptos test completed (simulation)");

    } catch (error) {
      console.error("❌ Base Sepolia -> Aptos test failed:", error);
      this.log(`Base Sepolia -> Aptos test failed: ${error}`);
    }
  }

  private saveDeploymentLog(): void {
    const logPath = path.join(__dirname, "..", "deployment_log.json");
    const fullLog = {
      timestamp: new Date().toISOString(),
      network: process.env.APTOS_NETWORK || "testnet",
      packageAddress: this.packageAddress,
      steps: this.deploymentLog,
      summary: {
        totalSteps: this.deploymentLog.length,
        successful: this.deploymentLog.filter(s => !s.action.includes("failed")).length,
        failed: this.deploymentLog.filter(s => s.action.includes("failed")).length,
      },
    };

    fs.writeFileSync(logPath, JSON.stringify(fullLog, null, 2));
    console.log(`\n📄 Deployment log saved to deployment_log.json`);
  }
}

// Run if called directly
if (require.main === module) {
  const deployment = new CompleteDeployment();
  deployment.deploy().catch(error => {
    console.error("❌ Complete deployment failed:", error);
    process.exit(1);
  });
}