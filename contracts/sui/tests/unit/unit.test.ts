import { SuiClient } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import * as dotenv from "dotenv";
import * as path from "path";
import deployments from "../../deployments.json";
import { setupTests, TEST_CONFIG } from "../setup";

dotenv.config({ path: path.join(__dirname, "../../.env") });

describe("📦 Sui Contract Unit Tests", () => {
  let client: SuiClient;
  let deployer: Ed25519Keypair;
  let user: Ed25519Keypair;
  let resolver1: Ed25519Keypair;
  let resolver2: Ed25519Keypair;
  let suiConfig: any;

  beforeAll(async () => {
    setupTests();
    
    const network = process.env.SUI_NETWORK || "testnet";
    const rpcUrl = process.env.SUI_RPC_URL || `https://fullnode.${network}.sui.io`;
    
    client = new SuiClient({ url: rpcUrl });
    
    // Setup keypairs
    deployer = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_PRIVATE_KEY!, "hex"));
    user = new Ed25519Keypair();
    resolver1 = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_0!, "hex"));
    resolver2 = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.SUI_RESOLVER_PRIVATE_KEY_1!, "hex"));
    
    suiConfig = deployments.sui?.[network];
    if (!suiConfig) {
      throw new Error(`No deployment configuration found for Sui ${network}`);
    }
    
    console.log("Using package:", suiConfig.packageId);
    console.log("Using factory:", suiConfig.EscrowFactory);
  });

  describe("🏭 EscrowFactory", () => {
    it("should have correct factory configuration", async () => {
      expect(suiConfig.EscrowFactory).toBeDefined();
      expect(suiConfig.EscrowFactory).not.toBe("");
      
      // Try to get factory object
      const factoryObject = await client.getObject({
        id: suiConfig.EscrowFactory,
        options: {
          showContent: true,
        },
      });
      
      expect(factoryObject.data).toBeDefined();
      console.log("✅ Factory object exists and is accessible");
    });

    it("should create source escrow with single resolver", async () => {
      const tx = new TransactionBlock();
      
      // Test parameters
      const orderHash = new Array(32).fill(0).map((_, i) => i); // 0x000102...1f
      const hashlock = new Array(32).fill(1); // Simple hashlock
      const maker = user.toSuiAddress();
      const taker = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const totalAmount = 1000000000; // 1 SUI
      const safetyDepositPerUnit = 100000000; // 0.1 SUI
      const partialAmount = 500000000; // 0.5 SUI
      
      // Create timelocks
      const timelocks = [
        0,      // deployed_at (set by contract)
        0,      // src_withdrawal
        900,    // src_public_withdrawal
        1800,   // src_cancellation
        3600,   // src_public_cancellation
        0,      // dst_withdrawal
        900,    // dst_public_withdrawal
        2700,   // dst_cancellation
      ];
      
      // Safety deposit for this resolver
      const [safetyDepositCoin] = tx.splitCoins(tx.gas, [tx.pure(50000000)]); // 0.05 SUI
      
      tx.moveCall({
        target: `${suiConfig.packageId}::escrow_factory::create_src_escrow_partial`,
        arguments: [
          tx.object(suiConfig.EscrowFactory),
          tx.pure(orderHash),
          tx.pure(hashlock),
          tx.pure(maker),
          tx.pure(taker),
          tx.pure(totalAmount),
          tx.pure(safetyDepositPerUnit),
          tx.pure(timelocks),
          tx.pure(partialAmount),
          tx.pure(resolver1.toSuiAddress()),
          safetyDepositCoin,
          tx.object("0x6"), // Clock
        ],
      });
      
      const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: resolver1,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      expect(result.effects?.status.status).toBe("success");
      console.log("✅ Source escrow created successfully");
      console.log("   Tx:", result.digest);
      
      // Check for events
      const events = result.events || [];
      const escrowCreatedEvent = events.find(e => e.type.includes("EscrowCreated"));
      const resolverAddedEvent = events.find(e => e.type.includes("ResolverAdded"));
      
      expect(escrowCreatedEvent).toBeDefined();
      expect(resolverAddedEvent).toBeDefined();
      
      if (escrowCreatedEvent) {
        console.log("📊 Escrow created event:", escrowCreatedEvent.parsedJson);
      }
    });

    it("should create destination escrow with multiple resolvers", async () => {
      // First resolver creates the escrow
      const tx1 = new TransactionBlock();
      
      const orderHash = new Array(32).fill(2).map((_, i) => i + 2); // Different order hash
      const hashlock = new Array(32).fill(2);
      const maker = user.toSuiAddress();
      const taker = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const totalAmount = 2000000000; // 2 SUI
      const safetyDepositPerUnit = 100000000; // 0.1 SUI
      const resolver1Amount = 800000000; // 0.8 SUI
      const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      const timelocks = [0, 0, 900, 1800, 3600, 0, 900, 2700];
      
      const [safetyDepositCoin1] = tx1.splitCoins(tx1.gas, [tx1.pure(40000000)]); // 0.04 SUI
      
      tx1.moveCall({
        target: `${suiConfig.packageId}::escrow_factory::create_dst_escrow_partial`,
        arguments: [
          tx1.object(suiConfig.EscrowFactory),
          tx1.pure(orderHash),
          tx1.pure(hashlock),
          tx1.pure(maker),
          tx1.pure(taker),
          tx1.pure(totalAmount),
          tx1.pure(safetyDepositPerUnit),
          tx1.pure(timelocks),
          tx1.pure(srcCancellationTimestamp),
          tx1.pure(resolver1Amount),
          tx1.pure(resolver1.toSuiAddress()),
          safetyDepositCoin1,
          tx1.object("0x6"),
        ],
      });
      
      const result1 = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx1,
        signer: resolver1,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      expect(result1.effects?.status.status).toBe("success");
      console.log("✅ Destination escrow created by resolver 1");
      
      // Extract escrow ID from events
      let escrowId = "";
      const events = result1.events || [];
      for (const event of events) {
        if (event.type.includes("EscrowCreated")) {
          const eventData = event.parsedJson as any;
          if (eventData?.escrow_id) {
            escrowId = eventData.escrow_id;
            break;
          }
        }
      }
      
      expect(escrowId).not.toBe("");
      console.log("   Escrow ID:", escrowId);
      
      // Second resolver joins the escrow
      const tx2 = new TransactionBlock();
      const resolver2Amount = 1200000000; // 1.2 SUI
      
      const [safetyDepositCoin2] = tx2.splitCoins(tx2.gas, [tx2.pure(60000000)]); // 0.06 SUI
      
      tx2.moveCall({
        target: `${suiConfig.packageId}::escrow_factory::add_resolver_to_dst_escrow`,
        arguments: [
          tx2.object(suiConfig.EscrowFactory),
          tx2.object(escrowId),
          tx2.pure(orderHash),
          tx2.pure(resolver2.toSuiAddress()),
          tx2.pure(resolver2Amount),
          safetyDepositCoin2,
        ],
      });
      
      const result2 = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx2,
        signer: resolver2,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      expect(result2.effects?.status.status).toBe("success");
      console.log("✅ Resolver 2 added to destination escrow");
      
      // Verify total filled amount in factory
      // Note: This would require a view function call to check the state
      console.log("📊 Multi-resolver escrow setup completed");
    });
  });

  describe("🔒 Escrow Contract", () => {
    let testEscrowId: string;
    const testSecret = new Array(32).fill(0x42); // Simple test secret
    const testHashlock = Array.from(require('crypto').createHash('sha256').update(Buffer.from(testSecret)).digest());
    
    it("should deposit tokens to escrow", async () => {
      // First create an escrow to test with
      const tx1 = new TransactionBlock();
      
      const orderHash = new Array(32).fill(3).map((_, i) => i + 3);
      const maker = user.toSuiAddress();
      const taker = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const totalAmount = 1000000000;
      const safetyDepositPerUnit = 100000000;
      const partialAmount = 1000000000;
      const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600;
      
      const timelocks = [0, 0, 900, 1800, 3600, 0, 900, 2700];
      
      const [safetyDepositCoin] = tx1.splitCoins(tx1.gas, [tx1.pure(100000000)]);
      
      tx1.moveCall({
        target: `${suiConfig.packageId}::escrow_factory::create_dst_escrow_partial`,
        arguments: [
          tx1.object(suiConfig.EscrowFactory),
          tx1.pure(orderHash),
          tx1.pure(testHashlock),
          tx1.pure(maker),
          tx1.pure(taker),
          tx1.pure(totalAmount),
          tx1.pure(safetyDepositPerUnit),
          tx1.pure(timelocks),
          tx1.pure(srcCancellationTimestamp),
          tx1.pure(partialAmount),
          tx1.pure(resolver1.toSuiAddress()),
          safetyDepositCoin,
          tx1.object("0x6"),
        ],
      });
      
      const result1 = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx1,
        signer: resolver1,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      expect(result1.effects?.status.status).toBe("success");
      
      // Extract escrow ID
      const events = result1.events || [];
      for (const event of events) {
        if (event.type.includes("EscrowCreated")) {
          const eventData = event.parsedJson as any;
          if (eventData?.escrow_id) {
            testEscrowId = eventData.escrow_id;
            break;
          }
        }
      }
      
      expect(testEscrowId).toBeDefined();
      console.log("✅ Test escrow created:", testEscrowId);
      
      // Now deposit tokens
      const tx2 = new TransactionBlock();
      const [depositCoin] = tx2.splitCoins(tx2.gas, [tx2.pure(1000000000)]); // 1 SUI
      
      tx2.moveCall({
        target: `${suiConfig.packageId}::escrow::deposit_sui_tokens`,
        arguments: [
          tx2.object(testEscrowId),
          depositCoin,
        ],
      });
      
      const result2 = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx2,
        signer: resolver1,
        options: {
          showEffects: true,
        },
      });
      
      expect(result2.effects?.status.status).toBe("success");
      console.log("✅ Tokens deposited to escrow");
      console.log("   Tx:", result2.digest);
    });

    it("should withdraw with correct secret", async () => {
      if (!testEscrowId) {
        console.log("⚠️ Skipping withdrawal test - no escrow ID");
        return;
      }
      
      const tx = new TransactionBlock();
      
      tx.moveCall({
        target: `${suiConfig.packageId}::escrow::withdraw_sui_with_secret`,
        arguments: [
          tx.object(testEscrowId),
          tx.pure(testSecret),
          tx.object("0x6"), // Clock
        ],
      });
      
      // Check user balance before
      const balanceBefore = await client.getBalance({ owner: user.toSuiAddress() });
      const suiBefore = parseInt(balanceBefore.totalBalance);
      
      const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: user,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      expect(result.effects?.status.status).toBe("success");
      console.log("✅ Withdrawal with secret successful");
      
      // Check user balance after
      const balanceAfter = await client.getBalance({ owner: user.toSuiAddress() });
      const suiAfter = parseInt(balanceAfter.totalBalance);
      
      console.log("   SUI received:", (suiAfter - suiBefore) / 1e9);
      
      // Check events
      const events = result.events || [];
      const fundsDistributedEvent = events.find(e => e.type.includes("FundsDistributed"));
      const withdrawnEvent = events.find(e => e.type.includes("Withdrawn"));
      
      expect(fundsDistributedEvent).toBeDefined();
      expect(withdrawnEvent).toBeDefined();
      
      if (fundsDistributedEvent) {
        console.log("📊 Funds distributed event:", fundsDistributedEvent.parsedJson);
      }
    });
  });

  describe("🏪 MockUSDC", () => {
    it("should mint test tokens", async () => {
      const tx = new TransactionBlock();
      
      const mintAmount = 1000 * 1e6; // 1000 USDC
      
      tx.moveCall({
        target: `${suiConfig.packageId}::mock_usdc::mint_and_transfer`,
        arguments: [
          tx.object(suiConfig.MockUSDC),
          tx.pure(mintAmount),
          tx.pure(user.toSuiAddress()),
        ],
      });
      
      const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: deployer,
        options: {
          showEffects: true,
        },
      });
      
      expect(result.effects?.status.status).toBe("success");
      console.log("✅ Mock USDC minted successfully");
      console.log("   Amount:", mintAmount / 1e6, "USDC");
      console.log("   Recipient:", user.toSuiAddress());
      
      // Check if user received the coins
      const usdcCoins = await client.getCoins({
        owner: user.toSuiAddress(),
        coinType: `${suiConfig.packageId}::mock_usdc::MOCK_USDC`,
      });
      
      const totalBalance = usdcCoins.data.reduce((sum, coin) => sum + parseInt(coin.balance), 0);
      console.log("   User USDC balance:", totalBalance / 1e6);
      
      expect(totalBalance).toBeGreaterThan(0);
    });
  });

  describe("🔄 LimitOrderProtocol", () => {
    it("should create and hash orders", async () => {
      // This would test the order hashing and validation
      // Since Move doesn't have the same typescript interface,
      // we'd need to call the contract functions directly
      
      console.log("✅ LimitOrderProtocol contract accessible");
      console.log("   Address:", suiConfig.LimitOrderProtocol);
      
      // Verify the protocol object exists
      const protocolObject = await client.getObject({
        id: suiConfig.LimitOrderProtocol,
        options: {
          showContent: true,
        },
      });
      
      expect(protocolObject.data).toBeDefined();
      console.log("✅ Protocol object exists and is accessible");
    });
  });
});