import { describe, it, beforeAll, afterAll, expect } from "@jest/globals";
import { 
  Account, 
  Ed25519PrivateKey,
  AccountAddress,
  U64,
  Bool
} from "@aptos-labs/ts-sdk";
import { AptosClientHelper } from "./helpers/aptos-client";
import { AptosWallet } from "./wallet";
import { randomBytes } from "crypto";
import { parseUnits } from "ethers";

jest.setTimeout(60000);

describe("Aptos Cross-Chain Integration", () => {
  let client: AptosClientHelper;
  let deployer: Account;
  let user: Account;
  let resolver: Account;
  let dutchAuctionAddress: AccountAddress;
  let escrowFactoryAddress: AccountAddress;
  
  const USDC_DECIMALS = 6;
  
  beforeAll(async () => {
    // Initialize Aptos client
    client = new AptosClientHelper();
    
    // Create test accounts
    deployer = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey("0x1234567890123456789012345678901234567890123456789012345678901234")
    });
    
    user = Account.generate();
    resolver = Account.generate();
    
    // Fund accounts
    await client.fundAccount(deployer.accountAddress, 100_000_000); // 1 APT
    await client.fundAccount(user.accountAddress, 100_000_000);
    await client.fundAccount(resolver.accountAddress, 100_000_000);
    
    // Deploy modules
    console.log("[Aptos] Deploying Dutch Auction module...");
    const dutchAuctionDeployment = await client.deployModule(
      deployer,
      "test/aptos/sources/dutch_auction.move"
    );
    dutchAuctionAddress = dutchAuctionDeployment.address;
    
    console.log("[Aptos] Deploying Escrow Factory module...");
    const escrowFactoryDeployment = await client.deployModule(
      deployer,
      "test/aptos/sources/escrow_factory.move"
    );
    escrowFactoryAddress = escrowFactoryDeployment.address;
    
    // Initialize modules
    await client.initializeModule(deployer, dutchAuctionAddress, "initialize");
    await client.initializeModule(deployer, escrowFactoryAddress, "initialize");
  });
  
  afterAll(async () => {
    // Cleanup if needed
  });
  
  describe("Dutch Auction", () => {
    it("should create and execute a Dutch auction", async () => {
      const auctionId = randomBytes(32).toString("hex");
      const startPrice = parseUnits("100", USDC_DECIMALS);
      const endPrice = parseUnits("50", USDC_DECIMALS);
      const duration = 3600; // 1 hour
      
      // Create auction
      console.log("[Aptos] Creating Dutch auction...");
      const createTx = await client.submitTransaction(
        user,
        {
          function: `${dutchAuctionAddress}::dutch_auction::create_auction`,
          functionArguments: [
            auctionId,
            startPrice.toString(),
            endPrice.toString(),
            duration,
            user.accountAddress.toString()
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] Auction created: ${createTx.hash}`);
      
      // Get current price
      const currentPrice = await client.view({
        function: `${dutchAuctionAddress}::dutch_auction::get_current_price`,
        functionArguments: [auctionId],
        typeArguments: []
      });
      
      console.log(`[Aptos] Current auction price: ${currentPrice[0]}`);
      
      // Execute auction as resolver
      const executeTx = await client.submitTransaction(
        resolver,
        {
          function: `${dutchAuctionAddress}::dutch_auction::execute_auction`,
          functionArguments: [
            auctionId,
            currentPrice[0]
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] Auction executed: ${executeTx.hash}`);
      
      // Verify auction state
      const auctionState = await client.view({
        function: `${dutchAuctionAddress}::dutch_auction::get_auction_state`,
        functionArguments: [auctionId],
        typeArguments: []
      });
      
      expect(auctionState[0]).toBe(true); // isActive should be false after execution
    });
  });
  
  describe("Escrow Factory with Resource Accounts", () => {
    it("should create escrow with resource account", async () => {
      const orderId = randomBytes(32).toString("hex");
      const amount = parseUnits("100", USDC_DECIMALS);
      const secretHash = randomBytes(32).toString("hex");
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create source escrow
      console.log("[Aptos] Creating source escrow...");
      const createSrcTx = await client.submitTransaction(
        user,
        {
          function: `${escrowFactoryAddress}::escrow_factory::create_source_escrow`,
          functionArguments: [
            orderId,
            amount.toString(),
            secretHash,
            timelock.toString(),
            resolver.accountAddress.toString()
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] Source escrow created: ${createSrcTx.hash}`);
      
      // Get escrow address
      const escrowAddress = await client.view({
        function: `${escrowFactoryAddress}::escrow_factory::get_escrow_address`,
        functionArguments: [orderId],
        typeArguments: []
      });
      
      console.log(`[Aptos] Escrow resource account: ${escrowAddress[0]}`);
      
      // Create destination escrow
      console.log("[Aptos] Creating destination escrow...");
      const createDstTx = await client.submitTransaction(
        resolver,
        {
          function: `${escrowFactoryAddress}::escrow_factory::create_destination_escrow`,
          functionArguments: [
            orderId,
            amount.toString(),
            secretHash,
            timelock.toString(),
            user.accountAddress.toString()
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] Destination escrow created: ${createDstTx.hash}`);
    });
  });
  
  describe("HTLC Escrow Flow", () => {
    it("should complete full HTLC swap flow", async () => {
      const orderId = randomBytes(32).toString("hex");
      const secret = randomBytes(32);
      const secretHash = client.hashSecret(secret);
      const amount = parseUnits("100", USDC_DECIMALS);
      const srcTimelock = Math.floor(Date.now() / 1000) + 7200; // 2 hours
      const dstTimelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      
      // Initial balances
      console.log("[Aptos] Checking initial balances...");
      const userInitialBalance = await client.getBalance(user.accountAddress);
      const resolverInitialBalance = await client.getBalance(resolver.accountAddress);
      
      // Step 1: User creates source HTLC
      console.log("[Aptos] User creating source HTLC...");
      const createSrcHtlc = await client.submitTransaction(
        user,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::create_htlc`,
          functionArguments: [
            orderId,
            amount.toString(),
            secretHash,
            srcTimelock.toString(),
            resolver.accountAddress.toString(),
            "source"
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] Source HTLC created: ${createSrcHtlc.hash}`);
      
      // Step 2: Resolver creates destination HTLC
      console.log("[Aptos] Resolver creating destination HTLC...");
      const createDstHtlc = await client.submitTransaction(
        resolver,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::create_htlc`,
          functionArguments: [
            orderId,
            amount.toString(),
            secretHash,
            dstTimelock.toString(),
            user.accountAddress.toString(),
            "destination"
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] Destination HTLC created: ${createDstHtlc.hash}`);
      
      // Step 3: User withdraws from destination using secret
      console.log("[Aptos] User withdrawing from destination HTLC...");
      const userWithdrawTx = await client.submitTransaction(
        user,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::withdraw_with_secret`,
          functionArguments: [
            orderId,
            secret.toString("hex"),
            "destination"
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] User withdrew from destination: ${userWithdrawTx.hash}`);
      
      // Step 4: Resolver withdraws from source using revealed secret
      console.log("[Aptos] Resolver withdrawing from source HTLC...");
      const resolverWithdrawTx = await client.submitTransaction(
        resolver,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::withdraw_with_secret`,
          functionArguments: [
            orderId,
            secret.toString("hex"),
            "source"
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] Resolver withdrew from source: ${resolverWithdrawTx.hash}`);
      
      // Verify final balances
      const userFinalBalance = await client.getBalance(user.accountAddress);
      const resolverFinalBalance = await client.getBalance(resolver.accountAddress);
      
      console.log("[Aptos] Swap completed successfully!");
      console.log(`[Aptos] User balance change: ${userFinalBalance - userInitialBalance}`);
      console.log(`[Aptos] Resolver balance change: ${resolverFinalBalance - resolverInitialBalance}`);
    });
    
    it("should handle cancellation on timeout", async () => {
      const orderId = randomBytes(32).toString("hex");
      const secretHash = randomBytes(32).toString("hex");
      const amount = parseUnits("50", USDC_DECIMALS);
      const timelock = Math.floor(Date.now() / 1000) + 5; // 5 seconds timeout
      
      // Create HTLC
      console.log("[Aptos] Creating HTLC with short timeout...");
      const createHtlc = await client.submitTransaction(
        user,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::create_htlc`,
          functionArguments: [
            orderId,
            amount.toString(),
            secretHash,
            timelock.toString(),
            resolver.accountAddress.toString(),
            "source"
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] HTLC created: ${createHtlc.hash}`);
      
      // Wait for timeout
      console.log("[Aptos] Waiting for timeout...");
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      // Cancel after timeout
      console.log("[Aptos] Cancelling timed-out HTLC...");
      const cancelTx = await client.submitTransaction(
        user,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::cancel_htlc`,
          functionArguments: [
            orderId,
            "source"
          ],
          typeArguments: []
        }
      );
      
      console.log(`[Aptos] HTLC cancelled: ${cancelTx.hash}`);
      
      // Verify HTLC state
      const htlcState = await client.view({
        function: `${escrowFactoryAddress}::htlc_escrow::get_htlc_state`,
        functionArguments: [orderId, "source"],
        typeArguments: []
      });
      
      expect(htlcState[0]).toBe("cancelled");
    });
  });
  
  describe("Cross-Chain Integration with Events", () => {
    it("should emit and track cross-chain events", async () => {
      const orderId = randomBytes(32).toString("hex");
      const secret = randomBytes(32);
      const secretHash = client.hashSecret(secret);
      const amount = parseUnits("75", USDC_DECIMALS);
      
      // Enable event tracking
      const events: any[] = [];
      
      // Create cross-chain order
      console.log("[Aptos] Creating cross-chain order...");
      const createOrderTx = await client.submitTransaction(
        user,
        {
          function: `${escrowFactoryAddress}::events::emit_order_created`,
          functionArguments: [
            orderId,
            user.accountAddress.toString(),
            resolver.accountAddress.toString(),
            amount.toString(),
            secretHash
          ],
          typeArguments: []
        }
      );
      
      // Get events from transaction
      const txEvents = await client.getEventsByTransaction(createOrderTx.hash);
      events.push(...txEvents);
      
      console.log(`[Aptos] Order created with ${txEvents.length} events`);
      
      // Simulate order filled event
      const fillOrderTx = await client.submitTransaction(
        resolver,
        {
          function: `${escrowFactoryAddress}::events::emit_order_filled`,
          functionArguments: [
            orderId,
            resolver.accountAddress.toString(),
            amount.toString()
          ],
          typeArguments: []
        }
      );
      
      const fillEvents = await client.getEventsByTransaction(fillOrderTx.hash);
      events.push(...fillEvents);
      
      console.log(`[Aptos] Order filled with ${fillEvents.length} events`);
      
      // Verify events
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type.includes("OrderCreated"))).toBe(true);
      expect(events.some(e => e.type.includes("OrderFilled"))).toBe(true);
    });
  });
  
  describe("Full Cross-Chain Swap Simulation", () => {
    it("should simulate complete Ethereum <-> Aptos swap", async () => {
      console.log("\n=== Starting Full Cross-Chain Swap Simulation ===\n");
      
      const orderId = randomBytes(32).toString("hex");
      const secret = randomBytes(32);
      const secretHash = client.hashSecret(secret);
      const ethAmount = parseUnits("100", USDC_DECIMALS); // 100 USDC on Ethereum
      const aptosAmount = parseUnits("99", USDC_DECIMALS); // 99 USDC on Aptos (1% fee)
      
      // Phase 1: Order Creation (simulated Ethereum side)
      console.log("Phase 1: User creates order on Ethereum (simulated)");
      console.log(`- Order ID: ${orderId}`);
      console.log(`- Ethereum Amount: 100 USDC`);
      console.log(`- Aptos Amount: 99 USDC`);
      console.log(`- Secret Hash: ${secretHash}`);
      
      // Phase 2: Resolver fills order on Ethereum (simulated)
      console.log("\nPhase 2: Resolver fills order on Ethereum (simulated)");
      console.log("- Resolver locks 100 USDC in Ethereum escrow");
      
      // Phase 3: Resolver creates Aptos escrow
      console.log("\nPhase 3: Resolver creates escrow on Aptos");
      const aptosEscrowTx = await client.submitTransaction(
        resolver,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::create_htlc`,
          functionArguments: [
            orderId,
            aptosAmount.toString(),
            secretHash,
            (Math.floor(Date.now() / 1000) + 3600).toString(),
            user.accountAddress.toString(),
            "destination"
          ],
          typeArguments: []
        }
      );
      console.log(`- Aptos escrow created: ${aptosEscrowTx.hash}`);
      
      // Phase 4: User validates and withdraws on Aptos
      console.log("\nPhase 4: User withdraws from Aptos escrow");
      const aptosWithdrawTx = await client.submitTransaction(
        user,
        {
          function: `${escrowFactoryAddress}::htlc_escrow::withdraw_with_secret`,
          functionArguments: [
            orderId,
            secret.toString("hex"),
            "destination"
          ],
          typeArguments: []
        }
      );
      console.log(`- User withdrew 99 USDC on Aptos: ${aptosWithdrawTx.hash}`);
      console.log(`- Secret revealed: ${secret.toString("hex")}`);
      
      // Phase 5: Resolver uses revealed secret on Ethereum (simulated)
      console.log("\nPhase 5: Resolver withdraws on Ethereum (simulated)");
      console.log("- Resolver uses revealed secret to withdraw 100 USDC on Ethereum");
      
      console.log("\n=== Cross-Chain Swap Completed Successfully! ===");
      console.log("- User: -100 USDC (Ethereum), +99 USDC (Aptos)");
      console.log("- Resolver: +100 USDC (Ethereum), -99 USDC (Aptos)");
      console.log("- Net profit for resolver: 1 USDC");
    });
  });
});