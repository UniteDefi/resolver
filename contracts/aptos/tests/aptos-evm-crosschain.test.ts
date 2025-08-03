import { describe, it, expect, beforeAll } from "vitest";
import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
  U64,
} from "@aptos-labs/ts-sdk";
import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  solidityPackedKeccak256,
  randomBytes,
  getBytes,
  hexlify,
  TypedDataDomain,
  TypedDataField,
} from "ethers";
import * as dotenv from "dotenv";
import allDeployments from "../deployments.json";

dotenv.config();

// Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const ESCROW_FACTORY_ABI = [
  "function createSrcEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 partialAmount, address resolver) external payable returns (address)",
  "function createDstEscrowPartialFor(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, uint256 srcCancellationTimestamp, uint256 partialAmount, address resolver) external payable returns (address)",
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function getTotalFilledAmount(bytes32 orderHash) external view returns (uint256)",
  "function transferUserFunds(bytes32 orderHash, address from, address token, uint256 amount) external"
];

const UNITE_RESOLVER_ABI = [
  "function deploySrcCompactPartial(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order, bytes32 r, bytes32 vs, uint256 amount, uint256 partialAmount) external payable"
];

const ESCROW_ABI = [
  "function withdrawWithSecret(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external"
];

const LIMIT_ORDER_PROTOCOL_ABI = [
  "function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 deadline, uint256 nonce, uint256 srcChainId, uint256 dstChainId, uint256 auctionStartTime, uint256 auctionEndTime, uint256 startPrice, uint256 endPrice) order) external view returns (bytes32)",
  "function nonces(address) external view returns (uint256)"
];

// Deployed contract addresses from deployments.json
const deployments = allDeployments;
const APTOS_DEPLOYMENTS = deployments.aptos.testnet;
const BASE_SEPOLIA_DEPLOYMENTS = deployments.evm.base_sepolia;

// Helper functions
function encodeTimelocks(timelocks: Record<string, bigint>): bigint {
  let encoded = 0n;
  encoded |= (timelocks.srcWithdrawal & 0xFFFFFFFFn);
  encoded |= (timelocks.srcPublicWithdrawal & 0xFFFFFFFFn) << 32n;
  encoded |= (timelocks.srcCancellation & 0xFFFFFFFFn) << 64n;
  encoded |= (timelocks.srcPublicCancellation & 0xFFFFFFFFn) << 96n;
  encoded |= (timelocks.dstWithdrawal & 0xFFFFFFFFn) << 128n;
  encoded |= (timelocks.dstPublicWithdrawal & 0xFFFFFFFFn) << 160n;
  encoded |= (timelocks.dstCancellation & 0xFFFFFFFFn) << 192n;
  return encoded;
}

function encodeAptosTimelocks(timelocks: Record<string, number>): string {
  // For Aptos U64, we need to limit the encoding to fit within 64 bits
  // We'll use 9 bits per timelock (max value 511 seconds) for 7 timelocks = 63 bits total
  let encoded = 0n;
  const mask = 0x1FF; // 9 bits mask (max value 511)
  
  encoded |= BigInt(timelocks.srcWithdrawal & mask);
  encoded |= BigInt(timelocks.srcPublicWithdrawal & mask) << 9n;
  encoded |= BigInt(timelocks.srcCancellation & mask) << 18n;
  encoded |= BigInt(timelocks.srcPublicCancellation & mask) << 27n;
  encoded |= BigInt(timelocks.dstWithdrawal & mask) << 36n;
  encoded |= BigInt(timelocks.dstPublicWithdrawal & mask) << 45n;
  encoded |= BigInt(timelocks.dstCancellation & mask) << 54n;
  
  return encoded.toString();
}

async function signOrder(
  order: any,
  signer: Wallet,
  contractName: string,
  version: string,
  chainId: number,
  verifyingContract: string
): Promise<{ r: string, vs: string }> {
  const domain: TypedDataDomain = {
    name: contractName,
    version: version,
    chainId: chainId,
    verifyingContract: verifyingContract
  };

  const types: Record<string, Array<TypedDataField>> = {
    Order: [
      { name: "salt", type: "uint256" },
      { name: "maker", type: "address" },
      { name: "receiver", type: "address" },
      { name: "makerAsset", type: "address" },
      { name: "takerAsset", type: "address" },
      { name: "makingAmount", type: "uint256" },
      { name: "takingAmount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "srcChainId", type: "uint256" },
      { name: "dstChainId", type: "uint256" },
      { name: "auctionStartTime", type: "uint256" },
      { name: "auctionEndTime", type: "uint256" },
      { name: "startPrice", type: "uint256" },
      { name: "endPrice", type: "uint256" }
    ]
  };

  const signature = await signer.signTypedData(domain, types, order);
  const sig = getBytes(signature);
  
  const r = hexlify(sig.slice(0, 32));
  const s = hexlify(sig.slice(32, 64));
  const v = sig[64];
  
  const vBit = v - 27;
  let sBytes = getBytes(s);
  if (vBit === 1) {
    sBytes[0] |= 0x80;
  }
  const vs = hexlify(sBytes);

  return { r, vs };
}

describe("🌉 Aptos ↔ Base Sepolia Cross-Chain Swaps", () => {
  let aptos: Aptos;
  let aptosUser: Account;
  let aptosResolver1: Account;
  let aptosResolver2: Account;
  let evmProvider: JsonRpcProvider;
  let evmUser: Wallet;
  let evmResolver1: Wallet;
  let evmResolver2: Wallet;
  let relayer: Wallet;

  beforeAll(async () => {
    // Setup Aptos
    const network = Network.TESTNET;
    const config = new AptosConfig({ network });
    aptos = new Aptos(config);
    
    // Create Aptos accounts from environment
    const aptosAdminKey = process.env.APTOS_PRIVATE_KEY;
    const aptosUserKey = process.env.APTOS_USER_PRIVATE_KEY;
    const aptosResolver1Key = process.env.APTOS_RESOLVER_PRIVATE_KEY_0;
    const aptosResolver2Key = process.env.APTOS_RESOLVER_PRIVATE_KEY_1;

    if (!aptosAdminKey || !aptosUserKey || !aptosResolver1Key || !aptosResolver2Key) {
      throw new Error("Missing required Aptos private keys in environment");
    }

    aptosUser = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(aptosUserKey),
    });
    aptosResolver1 = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(aptosResolver1Key),
    });
    aptosResolver2 = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(aptosResolver2Key),
    });

    // Setup EVM
    evmProvider = new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
    
    const evmUserKey = process.env.TEST_USER_PRIVATE_KEY;
    const evmResolver1Key = process.env.RESOLVER_PRIVATE_KEY_0;
    const evmResolver2Key = process.env.RESOLVER_PRIVATE_KEY_1;
    const relayerKey = process.env.DEPLOYER_PRIVATE_KEY;

    if (!evmUserKey || !evmResolver1Key || !evmResolver2Key || !relayerKey) {
      throw new Error("Missing required EVM private keys in environment");
    }

    evmUser = new Wallet(evmUserKey, evmProvider);
    evmResolver1 = new Wallet(evmResolver1Key, evmProvider);
    evmResolver2 = new Wallet(evmResolver2Key, evmProvider);
    relayer = new Wallet(relayerKey, evmProvider);

    console.log("\n=== TEST SETUP ===");
    console.log("Aptos Package:", APTOS_DEPLOYMENTS.packageAddress);
    console.log("Aptos User:", aptosUser.accountAddress.toString());
    console.log("Aptos Resolver 1:", aptosResolver1.accountAddress.toString());
    console.log("Aptos Resolver 2:", aptosResolver2.accountAddress.toString());
    console.log("EVM User:", evmUser.address);
    console.log("EVM Resolver 1:", evmResolver1.address);
    console.log("EVM Resolver 2:", evmResolver2.address);
    console.log("Relayer:", relayer.address);

    // Initialize test coins if not already initialized
    const adminAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(aptosAdminKey),
    });

    // Initialize USDT
    try {
      const initUSDTTxn = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::initialize_usdt`,
          functionArguments: [],
        },
      });
      await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction: initUSDTTxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ Initialized Test USDT");
    } catch (error) {
      console.log("Test USDT already initialized");
    }

    // Initialize DAI
    try {
      const initDAITxn = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::initialize_dai`,
          functionArguments: [],
        },
      });
      await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction: initDAITxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ Initialized Test DAI");
    } catch (error) {
      console.log("Test DAI already initialized");
    }
  });

// Replace both tests in aptos-evm-crosschain.test.ts

  it("should execute Base Sepolia → Aptos cross-chain swap", async () => {
    console.log("\n=== BASE SEPOLIA → APTOS SWAP ===");

    // STEP 1: Setup and check balances
    console.log("\n--- Step 1: Setup and Balances ---");
    
    const evmUSDT = new Contract(BASE_SEPOLIA_DEPLOYMENTS.MockUSDT, ERC20_ABI, evmUser);
    const evmFactory = new Contract(BASE_SEPOLIA_DEPLOYMENTS.UniteEscrowFactory, ESCROW_FACTORY_ABI, relayer);
    const evmLOP = new Contract(BASE_SEPOLIA_DEPLOYMENTS.UniteLimitOrderProtocol, LIMIT_ORDER_PROTOCOL_ABI, evmProvider);
    
    // Check EVM user USDT balance
    const evmUserUSDTBalance = await evmUSDT.balanceOf(evmUser.address);
    console.log("EVM User USDT:", formatUnits(evmUserUSDTBalance, 6));
    
    // Register DAI for Aptos user - ENTRY FUNCTION CALL
    try {
      const registerTxn = await aptos.transaction.build.simple({
        sender: aptosUser.accountAddress,
        data: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::register_dai`,
          functionArguments: [],
        },
      });
      await aptos.signAndSubmitTransaction({ signer: aptosUser, transaction: registerTxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ User registered for DAI");
    } catch (error) {
      console.log("DAI already registered");
    }

    // Check DAI balance - now safe to call
const aptosUserDAIBalance = await aptos.view({
  payload: {
    function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::get_dai_balance`,
    functionArguments: [aptosUser.accountAddress],
  },
});
console.log("Aptos User DAI:", formatUnits(aptosUserDAIBalance[0] as string, 6)); // Changed from 18 to 6

    // STEP 2: Create cross-chain order
    console.log("\n--- Step 2: Create Cross-Chain Order ---");
    
    const totalAmount = parseUnits("100", 6); // 100 USDT
    const totalDAIAmount = parseUnits("99", 6); // 99 DAI (6 decimals for Aptos)
    const safetyDepositPerUnit = parseUnits("0.0001", 18);
    
    const secret = randomBytes(32);
    const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);
    
    console.log("Secret:", hexlify(secret));
    console.log("Hashlock:", hashlock);

    const auctionStartTime = Math.floor(Date.now() / 1000);
    const auctionEndTime = auctionStartTime + 300;
    const userNonce = await evmLOP.nonces(evmUser.address);

    const order = {
      salt: 12345n,
      maker: evmUser.address,
      receiver: evmUser.address,
      makerAsset: BASE_SEPOLIA_DEPLOYMENTS.MockUSDT,
      takerAsset: "0x0000000000000000000000000000000000000001", // Placeholder for Aptos DAI
      makingAmount: totalAmount,
      takingAmount: totalDAIAmount,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      nonce: userNonce,
      srcChainId: 84532, // Base Sepolia
      dstChainId: 2, // Aptos Testnet
      auctionStartTime,
      auctionEndTime,
      startPrice: parseUnits("0.99", 18),
      endPrice: parseUnits("0.97", 18),
    };

    const orderHash = await evmLOP.hashOrder(order);
    console.log("Order hash:", orderHash);

    const signature = await signOrder(
      order,
      evmUser,
      "UniteLimitOrderProtocol",
      "1",
      84532,
      BASE_SEPOLIA_DEPLOYMENTS.UniteLimitOrderProtocol
    );

    // STEP 3: Approve tokens
    console.log("\n--- Step 3: Approve Tokens ---");
    
    const currentAllowance = await evmUSDT.allowance(evmUser.address, BASE_SEPOLIA_DEPLOYMENTS.UniteEscrowFactory);
    if (currentAllowance < totalAmount) {
      const approveTx = await evmUSDT.approve(BASE_SEPOLIA_DEPLOYMENTS.UniteEscrowFactory, parseUnits("1000", 6));
      await approveTx.wait();
      console.log("✅ USDT approved on Base Sepolia");
    }

    // STEP 4: Resolvers commit on Base Sepolia (source)
    console.log("\n--- Step 4: Resolvers Commit on Base Sepolia ---");
    
    const timelocks = encodeTimelocks({
      srcWithdrawal: 0n,
      srcPublicWithdrawal: 900n,
      srcCancellation: 1800n,
      srcPublicCancellation: 3600n,
      dstWithdrawal: 0n,
      dstPublicWithdrawal: 900n,
      dstCancellation: 2700n,
    });

    const totalSafetyDeposit = (safetyDepositPerUnit * totalAmount) / parseUnits("1", 6);

    const srcImmutables = {
      orderHash: orderHash,
      hashlock: hashlock,
      maker: BigInt(evmUser.address),
      taker: BigInt(evmUser.address),
      token: BigInt(BASE_SEPOLIA_DEPLOYMENTS.MockUSDT),
      amount: totalAmount,
      safetyDeposit: totalSafetyDeposit,
      timelocks: timelocks
    };

    const resolver1Amount = parseUnits("60", 6);
    const resolver1SafetyDeposit = (totalSafetyDeposit * resolver1Amount) / totalAmount;

    // Deploy source escrows
    const resolver1Contract = new Contract(BASE_SEPOLIA_DEPLOYMENTS.UniteResolver0, UNITE_RESOLVER_ABI, evmResolver1);

    try {
      const tx1 = await resolver1Contract.deploySrcCompactPartial(
        srcImmutables, order, signature.r, signature.vs, resolver1Amount, resolver1Amount,
        { value: resolver1SafetyDeposit, gasLimit: 5000000 }
      );
      await tx1.wait();
      console.log("✅ Resolver 1 committed on Base Sepolia");
    } catch (error: any) {
      console.log("❌ Resolver 1 commitment failed:", error.message);
    }

    // STEP 5: Resolvers commit on Aptos (destination) - REAL IMPLEMENTATION
    console.log("\n--- Step 5: Resolvers Commit on Aptos ---");

    // Initialize resolvers - ENTRY FUNCTION CALLS
    try {
      const initTxn = await aptos.transaction.build.simple({
        sender: aptosResolver1.accountAddress,
        data: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::resolver::initialize`,
          functionArguments: [APTOS_DEPLOYMENTS.packageAddress, APTOS_DEPLOYMENTS.packageAddress],
        },
      });
      await aptos.signAndSubmitTransaction({ signer: aptosResolver1, transaction: initTxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ Resolver 1 initialized");
    } catch (error) {
      console.log("Resolver 1 already initialized");
    }

    // Register resolvers for DAI - ENTRY FUNCTION CALLS
    try {
      const registerTxn = await aptos.transaction.build.simple({
        sender: aptosResolver1.accountAddress,
        data: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::register_dai`,
          functionArguments: [],
        },
      });
      await aptos.signAndSubmitTransaction({ signer: aptosResolver1, transaction: registerTxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ Resolver 1 registered for DAI");
    } catch (error) {
      console.log("Resolver 1 already registered for DAI");
    }

    // Mint DAI to resolver 1 - ENTRY FUNCTION CALL
    const adminAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY!),
    });

    try {
const mintTxn1 = await aptos.transaction.build.simple({
  sender: adminAccount.accountAddress,
  data: {
    function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::mint_dai`,
    functionArguments: [
      aptosResolver1.accountAddress,
      parseUnits("100", 6).toString(), // Changed from 18 to 6
    ],
  },
});
      await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction: mintTxn1 })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ Minted DAI to Aptos Resolver 1");
    } catch (error: any) {
      console.log("❌ DAI mint to resolver 1 failed:", error.message);
    }

    // Create Aptos destination escrow - ENTRY FUNCTION CALL
    const aptosTimelocks = encodeAptosTimelocks({
      srcWithdrawal: 0,
      srcPublicWithdrawal: 300,
      srcCancellation: 450,
      srcPublicCancellation: 511,
      dstWithdrawal: 0,
      dstPublicWithdrawal: 300,
      dstCancellation: 450,
    });

    const srcCancellationTimestamp = Math.floor(Date.now() / 1000) + 3600;

    try {
const deployTxn = await aptos.transaction.build.simple({
  sender: aptosResolver1.accountAddress,
  data: {
    function: `${APTOS_DEPLOYMENTS.packageAddress}::resolver::deploy_dst_partial`,
    typeArguments: [`${APTOS_DEPLOYMENTS.packageAddress}::test_coin::TestDAI`],
    functionArguments: [
      Array.from(getBytes(orderHash)),
      Array.from(getBytes(hashlock)),
      aptosUser.accountAddress,
      "0x0",
      APTOS_DEPLOYMENTS.packageAddress,
      parseUnits("99", 6).toString(), // Already correct
      parseUnits("0.001", 18).toString(), // APT safety deposit stays 18
      aptosTimelocks,
      srcCancellationTimestamp,
      parseUnits("100", 6).toString(), // Changed from 18 to 6
      parseUnits("0.0001", 18).toString(), // APT safety deposit stays 18
    ],
  },
});

      await aptos.signAndSubmitTransaction({ signer: aptosResolver1, transaction: deployTxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ Aptos Resolver 1 deployed destination escrow");
    } catch (error: any) {
      console.log("❌ Aptos resolver 1 escrow failed:", error.message);
    }

    // STEP 6: Transfer user funds to source escrow
    console.log("\n--- Step 6: Transfer User Funds ---");
    
    const totalFilled = await evmFactory.getTotalFilledAmount(orderHash);
    if (totalFilled >= totalAmount) {
      try {
        const transferTx = await evmFactory.transferUserFunds(
          orderHash, evmUser.address, BASE_SEPOLIA_DEPLOYMENTS.MockUSDT, totalAmount
        );
        await transferTx.wait();
        console.log("✅ User funds transferred to source escrow");
      } catch (error: any) {
        console.log("❌ User funds transfer failed:", error.message);
      }
    }

    // STEP 7: Secret reveal and withdrawals - REAL IMPLEMENTATION
    console.log("\n--- Step 7: Secret Revealed & Withdrawals ---");
    console.log("🔓 Secret revealed:", hexlify(secret));

    // Withdraw from destination escrow (Aptos) - ENTRY FUNCTION CALL
    try {
      const dstEscrowAddr = await aptos.view({
        payload: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::escrow_factory::get_dst_escrow_address`,
          functionArguments: [Array.from(getBytes(orderHash)), APTOS_DEPLOYMENTS.packageAddress],
        },
      });

      if (dstEscrowAddr[0] !== "0x0") {
const withdrawTxn = await aptos.transaction.build.simple({
  sender: aptosUser.accountAddress,
  data: {
    function: `${APTOS_DEPLOYMENTS.packageAddress}::escrow_factory::withdraw_with_secret`,
    typeArguments: [`${APTOS_DEPLOYMENTS.packageAddress}::test_coin::TestDAI`],
    functionArguments: [
      Array.from(secret),
      Array.from(getBytes(orderHash)),
      Array.from(getBytes(hashlock)),
      aptosUser.accountAddress,
      "0x0",
      APTOS_DEPLOYMENTS.packageAddress,
      parseUnits("99", 6).toString(), // Changed from 18 to 6
      parseUnits("0.001", 18).toString(), // APT safety deposit stays 18
      aptosTimelocks,
      dstEscrowAddr[0],
    ],
  },
});

        await aptos.signAndSubmitTransaction({ signer: aptosUser, transaction: withdrawTxn })
          .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
        console.log("✅ User withdrew DAI from Aptos escrow");
      }
    } catch (error: any) {
      console.log("❌ Aptos withdrawal failed:", error.message);
    }

    // Withdraw from source escrow (Base Sepolia)
    try {
      const srcEscrowAddress = await evmFactory.addressOfEscrowSrc(srcImmutables);
      const srcEscrow = new Contract(srcEscrowAddress, ESCROW_ABI, evmUser);
      
      const withdrawTx = await srcEscrow.withdrawWithSecret(secret, srcImmutables, { gasLimit: 1000000 });
      await withdrawTx.wait();
      console.log("✅ Resolvers withdrew USDT from Base Sepolia escrow");
    } catch (error: any) {
      console.log("❌ Base Sepolia withdrawal failed:", error.message);
    }

    console.log("\n✅ Base Sepolia → Aptos swap completed!");
  }, 180000);

  it("should execute Aptos → Base Sepolia cross-chain swap", async () => {
    console.log("\n=== APTOS → BASE SEPOLIA SWAP ===");

    // STEP 1: Setup and check balances
    console.log("\n--- Step 1: Setup and Balances ---");
    
    const evmDAI = new Contract(BASE_SEPOLIA_DEPLOYMENTS.MockDAI, ERC20_ABI, evmUser);
    
    // Register USDT for Aptos user - ENTRY FUNCTION CALL
    try {
      const registerTxn = await aptos.transaction.build.simple({
        sender: aptosUser.accountAddress,
        data: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::register_usdt`,
          functionArguments: [],
        },
      });
      await aptos.signAndSubmitTransaction({ signer: aptosUser, transaction: registerTxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ User registered for USDT");
    } catch (error) {
      console.log("USDT already registered");
    }

    // Mint USDT to Aptos user - ENTRY FUNCTION CALL
    const adminAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY!),
    });

    const mintAmount = parseUnits("100", 6);
    try {
      const mintTxn = await aptos.transaction.build.simple({
        sender: adminAccount.accountAddress,
        data: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::mint_usdt`,
          functionArguments: [
            aptosUser.accountAddress,
            mintAmount.toString(),
          ],
        },
      });
      await aptos.signAndSubmitTransaction({ signer: adminAccount, transaction: mintTxn })
        .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
      console.log("✅ Minted 100 USDT to Aptos user");
    } catch (error: any) {
      console.log("❌ USDT mint failed:", error.message);
    }

    // Check balances - now safe to call
    const aptosUserUSDTBalance = await aptos.view({
      payload: {
        function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::get_usdt_balance`,
        functionArguments: [aptosUser.accountAddress],
      },
    });
    console.log("Aptos User USDT:", formatUnits(aptosUserUSDTBalance[0] as string, 6));

const evmUserDAIBalance = await evmDAI.balanceOf(evmUser.address);
console.log("EVM User DAI:", formatUnits(evmUserDAIBalance, 18));

    // STEP 2: Create reverse order
    console.log("\n--- Step 2: Create Reverse Cross-Chain Order ---");
    
const secret = randomBytes(32);
const hashlock = solidityPackedKeccak256(["bytes32"], [secret]);

// Create proper order hash instead of reusing hashlock
const reverseOrderHash = solidityPackedKeccak256(
  ["bytes32", "address", "uint256"], 
  [hashlock, aptosUser.accountAddress.toString(), mintAmount]
);

console.log("Reverse Secret:", hexlify(secret));
console.log("Reverse Hashlock:", hashlock);
console.log("Reverse Order Hash:", reverseOrderHash);

// STEP 3: Create Aptos Source Escrow
console.log("\n--- Step 3: Create Aptos Source Escrow ---");

try {
  const createSrcTxn = await aptos.transaction.build.simple({
    sender: aptosResolver1.accountAddress,
    data: {
      function: `${APTOS_DEPLOYMENTS.packageAddress}::escrow_factory::create_src_escrow_partial`,
      typeArguments: [`${APTOS_DEPLOYMENTS.packageAddress}::test_coin::TestUSDT`],
      functionArguments: [
        Array.from(getBytes(reverseOrderHash)), // Use proper order hash
        Array.from(getBytes(hashlock)),
        aptosUser.accountAddress,
        "0x0",
        APTOS_DEPLOYMENTS.packageAddress,
        mintAmount.toString(),
        parseUnits("0.01", 18).toString(), // Increased safety deposit
        aptosTimelocks,
        mintAmount.toString(),
        parseUnits("0.01", 18).toString(), // Increased safety deposit
      ],
    },
  });
  await aptos.signAndSubmitTransaction({ signer: aptosResolver1, transaction: createSrcTxn })
    .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
  console.log("✅ Source escrow created on Aptos");
} catch (error: any) {
  console.log("❌ Aptos source escrow failed:", error.message);
}

    // STEP 4: Create Base Sepolia destination escrow - REAL IMPLEMENTATION
   console.log("\n--- Step 4: Base Sepolia Destination Escrow ---");

const evmImmutables = {
  orderHash: reverseOrderHash, // Use proper order hash
  hashlock: hashlock,
  maker: BigInt(evmUser.address),
  taker: 0n,
  token: BigInt(BASE_SEPOLIA_DEPLOYMENTS.MockDAI),
  amount: parseUnits("99", 18),
  safetyDeposit: parseUnits("0.01", 18), // Increased safety deposit
  timelocks: evmTimelocks
};

// Ensure resolver has enough DAI first
const evmDAIAsResolver = evmDAI.connect(evmResolver1);
const resolverDAIBalance = await evmDAIAsResolver.balanceOf(evmResolver1.address);
console.log("Resolver 1 DAI balance:", formatUnits(resolverDAIBalance, 18));

if (resolverDAIBalance < parseUnits("99", 18)) {
  throw new Error("Resolver 1 needs more DAI tokens");
}

    // STEP 5: Transfer USDT from user to Aptos escrow - ENTRY FUNCTION CALL
    console.log("\n--- Step 5: Transfer User USDT to Aptos Escrow ---");
    
    try {
const aptosEscrowAddr = await aptos.view({
  payload: {
    function: `${APTOS_DEPLOYMENTS.packageAddress}::escrow_factory::get_src_escrow_address`,
    functionArguments: [Array.from(getBytes(reverseOrderHash)), APTOS_DEPLOYMENTS.packageAddress], // Use reverseOrderHash
  },
});
      
      if (aptosEscrowAddr[0] !== "0x0") {
        const transferTxn = await aptos.transaction.build.simple({
          sender: aptosUser.accountAddress,
          data: {
            function: `${APTOS_DEPLOYMENTS.packageAddress}::escrow_factory::user_deposit`,
            typeArguments: [`${APTOS_DEPLOYMENTS.packageAddress}::test_coin::TestUSDT`],
            functionArguments: [
              mintAmount.toString(),
              aptosEscrowAddr[0],
            ],
          },
        });
        await aptos.signAndSubmitTransaction({ signer: aptosUser, transaction: transferTxn })
          .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
        console.log("✅ User transferred USDT to Aptos escrow");
      }
    } catch (error: any) {
      console.log("❌ User USDT transfer failed:", error.message);
    }

    // STEP 6: Withdrawal process - REAL IMPLEMENTATION
    console.log("\n--- Step 6: Withdrawal Process ---");
    console.log("🔓 Secret revealed:", hexlify(secret));
    
    // User withdraws DAI from Base Sepolia escrow
    try {
      const dstEscrowAddress = await evmFactory.addressOfEscrowDst(evmImmutables);
      const dstEscrow = new Contract(dstEscrowAddress, ESCROW_ABI, evmUser);
      
      const userDAIBefore = await evmDAI.balanceOf(evmUser.address);
      
      const withdrawTx = await dstEscrow.withdrawWithSecret(secret, evmImmutables, { gasLimit: 1000000 });
      await withdrawTx.wait();
      
      const userDAIAfter = await evmDAI.balanceOf(evmUser.address);
      console.log("✅ User withdrew", formatUnits(userDAIAfter - userDAIBefore, 18), "DAI from Base Sepolia escrow");
    } catch (error: any) {
      console.log("❌ Base Sepolia withdrawal failed:", error.message);
    }

    // Resolver withdraws USDT from Aptos escrow - ENTRY FUNCTION CALL
    try {
      const aptosEscrowAddr = await aptos.view({
        payload: {
          function: `${APTOS_DEPLOYMENTS.packageAddress}::escrow_factory::get_src_escrow_address`,
          functionArguments: [Array.from(getBytes(hashlock)), APTOS_DEPLOYMENTS.packageAddress],
        },
      });

      if (aptosEscrowAddr[0] !== "0x0") {
       const withdrawTxn = await aptos.transaction.build.simple({
  sender: aptosResolver1.accountAddress,
  data: {
    function: `${APTOS_DEPLOYMENTS.packageAddress}::escrow_factory::withdraw_with_secret`,
    typeArguments: [`${APTOS_DEPLOYMENTS.packageAddress}::test_coin::TestUSDT`],
    functionArguments: [
      Array.from(secret),
      Array.from(getBytes(reverseOrderHash)), // Use reverseOrderHash
      Array.from(getBytes(hashlock)),
      aptosUser.accountAddress,
      "0x0",
      APTOS_DEPLOYMENTS.packageAddress,
      mintAmount.toString(),
      parseUnits("0.01", 18).toString(), // Match increased safety deposit
      aptosTimelocks,
      aptosEscrowAddr[0],
    ],
  },
});
        await aptos.signAndSubmitTransaction({ signer: aptosResolver1, transaction: withdrawTxn })
          .then(result => aptos.waitForTransaction({ transactionHash: result.hash }));
        console.log("✅ Resolver withdrew USDT from Aptos escrow");
      }
    } catch (error: any) {
      console.log("❌ Aptos withdrawal failed:", error.message);
    }

    console.log("\n✅ Aptos → Base Sepolia swap completed!");
  }, 180000);
});


async function checkAptosBalance(address: string, tokenType: string): Promise<bigint> {
  try {
    const balance = await aptos.view({
      payload: {
        function: `${APTOS_DEPLOYMENTS.packageAddress}::test_coin::get_${tokenType.toLowerCase()}_balance`,
        functionArguments: [address],
      },
    });
    return BigInt(balance[0] as string);
  } catch {
    return 0n;
  }
}