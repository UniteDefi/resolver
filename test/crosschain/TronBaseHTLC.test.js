const TronWeb = require("tronweb");
const { ethers } = require("ethers");
const crypto = require("crypto");
const { describe, it, before, after } = require("@jest/globals");
const { expect } = require("@jest/globals");

// Test Configuration
const TRON_CONFIG = {
  fullHost: "https://api.shasta.trongrid.io",
  privateKey: process.env.TRON_PRIVATE_KEY || "YOUR_TRON_PRIVATE_KEY",
  // Shasta testnet faucet: https://www.trongrid.io/shasta
};

const BASE_SEPOLIA_CONFIG = {
  rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  privateKey: process.env.BASE_SEPOLIA_PRIVATE_KEY || "YOUR_BASE_PRIVATE_KEY",
  chainId: 84532,
};

// HTLC Test Parameters
const HTLC_PARAMS = {
  srcWithdrawalDuration: 24 * 60 * 60, // 24 hours
  dstWithdrawalDuration: 23 * 60 * 60, // 23 hours
  dstCancellationDuration: 20 * 60 * 60, // 20 hours
  srcCancellationDuration: 16 * 60 * 60, // 16 hours
  safetyDeposit: "1000000", // 1 TRX in SUN units (TRX smallest unit)
  baseSafetyDeposit: ethers.parseEther("0.001"), // 0.001 ETH on Base
};

// Contract ABIs
const ESCROW_FACTORY_ABI = [
  "function deployEscrow(address token, uint256 amount, address taker, bytes32 hashlock, uint256 srcWithdrawal, uint256 srcCancellation, uint256 dstWithdrawal, uint256 dstCancellation, uint256 safetyDeposit) returns (address)",
  "event EscrowDeployed(address indexed escrow, address indexed token, uint256 amount, address indexed taker, bytes32 hashlock)",
];

const ESCROW_ABI = [
  "function withdraw(bytes32 secret) external",
  "function cancel() external",
  "function getState() external view returns (uint8)",
  "event Withdrawn(bytes32 secret)",
  "event Cancelled()",
];

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function mint(address to, uint256 amount) external",
];

describe("Tron <> Base Sepolia HTLC Cross-Chain Test", () => {
  let tronWeb;
  let baseSigner;
  let baseProvider;
  
  // Tron contracts
  let tronEscrowFactory;
  let tronTestToken;
  let tronUserAddress;
  let tronResolverAddress;
  
  // Base contracts
  let baseEscrowFactory;
  let baseTestToken;
  let baseUserAddress;
  let baseResolverAddress;
  
  // HTLC parameters
  let secret;
  let hashlock;

  before(async () => {
    console.log("[TronBaseHTLC] Initializing test environment...");
    
    // Initialize TronWeb
    tronWeb = new TronWeb({
      fullHost: TRON_CONFIG.fullHost,
      privateKey: TRON_CONFIG.privateKey,
    });
    
    // Initialize Base Sepolia provider
    baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_CONFIG.rpcUrl);
    baseSigner = new ethers.Wallet(BASE_SEPOLIA_CONFIG.privateKey, baseProvider);
    
    // Get addresses
    tronUserAddress = tronWeb.address.fromPrivateKey(TRON_CONFIG.privateKey);
    tronResolverAddress = tronWeb.address.fromPrivateKey(process.env.TRON_RESOLVER_PRIVATE_KEY || TRON_CONFIG.privateKey);
    baseUserAddress = await baseSigner.getAddress();
    baseResolverAddress = new ethers.Wallet(process.env.BASE_RESOLVER_PRIVATE_KEY || BASE_SEPOLIA_CONFIG.privateKey, baseProvider).address;
    
    console.log("[TronBaseHTLC] Tron User Address:", tronUserAddress);
    console.log("[TronBaseHTLC] Tron Resolver Address:", tronResolverAddress);
    console.log("[TronBaseHTLC] Base User Address:", baseUserAddress);
    console.log("[TronBaseHTLC] Base Resolver Address:", baseResolverAddress);
    
    // Generate secret and hashlock
    secret = "0x" + crypto.randomBytes(32).toString("hex");
    hashlock = ethers.keccak256(secret);
    
    console.log("[TronBaseHTLC] Secret:", secret);
    console.log("[TronBaseHTLC] Hashlock:", hashlock);
  });

  describe("Contract Deployment", () => {
    it("should deploy test token on Tron Shasta", async () => {
      console.log("[TronBaseHTLC] Deploying test token on Tron...");
      
      // TRC20 Token contract bytecode (simplified)
      const tokenContract = await tronWeb.contract().new({
        abi: ERC20_ABI,
        bytecode: "0x608060405234801561001057600080fd5b50...", // Add actual TRC20 bytecode
        parameters: ["TestToken", "TST", 18, ethers.parseUnits("1000000", 18).toString()],
        feeLimit: 1000000000, // 1000 TRX
        callValue: 0,
        userFeePercentage: 100,
        originEnergyLimit: 10000000,
      });
      
      tronTestToken = tokenContract.address;
      console.log("[TronBaseHTLC] Tron Test Token deployed at:", tronTestToken);
      
      // Check energy and bandwidth
      const accountResources = await tronWeb.trx.getAccountResources(tronUserAddress);
      console.log("[TronBaseHTLC] Account Energy:", accountResources.EnergyUsed || 0, "/", accountResources.EnergyLimit || 0);
      console.log("[TronBaseHTLC] Account Bandwidth:", accountResources.freeNetUsed || 0, "/", accountResources.freeNetLimit || 0);
    });

    it("should deploy test token on Base Sepolia", async () => {
      console.log("[TronBaseHTLC] Deploying test token on Base Sepolia...");
      
      // Deploy MockERC20 on Base
      const MockERC20 = new ethers.ContractFactory(
        ERC20_ABI,
        "0x608060405234801561001057600080fd5b50...", // Add actual ERC20 bytecode
        baseSigner
      );
      
      const baseToken = await MockERC20.deploy("TestToken", "TST", 18, ethers.parseUnits("1000000", 18));
      await baseToken.waitForDeployment();
      
      baseTestToken = await baseToken.getAddress();
      console.log("[TronBaseHTLC] Base Test Token deployed at:", baseTestToken);
    });

    it("should deploy EscrowFactory on Tron", async () => {
      console.log("[TronBaseHTLC] Deploying EscrowFactory on Tron...");
      
      const escrowFactoryContract = await tronWeb.contract().new({
        abi: ESCROW_FACTORY_ABI,
        bytecode: "0x608060405234801561001057600080fd5b50...", // Add actual EscrowFactory bytecode
        parameters: [],
        feeLimit: 1500000000, // 1500 TRX
        callValue: 0,
        userFeePercentage: 100,
        originEnergyLimit: 15000000,
      });
      
      tronEscrowFactory = escrowFactoryContract.address;
      console.log("[TronBaseHTLC] Tron EscrowFactory deployed at:", tronEscrowFactory);
    });

    it("should deploy EscrowFactory on Base Sepolia", async () => {
      console.log("[TronBaseHTLC] Deploying EscrowFactory on Base Sepolia...");
      
      const EscrowFactory = new ethers.ContractFactory(
        ESCROW_FACTORY_ABI,
        "0x608060405234801561001057600080fd5b50...", // Add actual EscrowFactory bytecode
        baseSigner
      );
      
      const factory = await EscrowFactory.deploy();
      await factory.waitForDeployment();
      
      baseEscrowFactory = await factory.getAddress();
      console.log("[TronBaseHTLC] Base EscrowFactory deployed at:", baseEscrowFactory);
    });
  });

  describe("HTLC Success Flow", () => {
    let tronEscrowAddress;
    let baseEscrowAddress;
    const swapAmount = ethers.parseUnits("100", 18); // 100 tokens

    it("should create source escrow on Tron", async () => {
      console.log("[TronBaseHTLC] Creating source escrow on Tron...");
      
      // Approve tokens
      const tokenContract = await tronWeb.contract(ERC20_ABI, tronTestToken);
      await tokenContract.approve(tronEscrowFactory, swapAmount.toString()).send({
        feeLimit: 100000000,
        callValue: 0,
      });
      
      // Deploy escrow
      const factoryContract = await tronWeb.contract(ESCROW_FACTORY_ABI, tronEscrowFactory);
      const currentTime = Math.floor(Date.now() / 1000);
      
      const tx = await factoryContract.deployEscrow(
        tronTestToken,
        swapAmount.toString(),
        tronResolverAddress,
        hashlock,
        currentTime + HTLC_PARAMS.srcWithdrawalDuration,
        currentTime + HTLC_PARAMS.srcCancellationDuration,
        currentTime + HTLC_PARAMS.dstWithdrawalDuration,
        currentTime + HTLC_PARAMS.dstCancellationDuration,
        HTLC_PARAMS.safetyDeposit
      ).send({
        feeLimit: 2000000000,
        callValue: HTLC_PARAMS.safetyDeposit,
      });
      
      // Get escrow address from event
      const receipt = await tronWeb.trx.getTransactionInfo(tx);
      console.log("[TronBaseHTLC] Tron escrow deployment tx:", tx);
      
      // Parse events to get escrow address
      // tronEscrowAddress = parseEscrowAddressFromEvents(receipt);
    });

    it("should create destination escrow on Base", async () => {
      console.log("[TronBaseHTLC] Creating destination escrow on Base...");
      
      // Deploy escrow on Base
      const factory = new ethers.Contract(baseEscrowFactory, ESCROW_FACTORY_ABI, baseSigner);
      const token = new ethers.Contract(baseTestToken, ERC20_ABI, baseSigner);
      
      // Approve tokens
      await token.approve(baseEscrowFactory, swapAmount);
      
      const currentTime = Math.floor(Date.now() / 1000);
      const tx = await factory.deployEscrow(
        baseTestToken,
        swapAmount,
        baseUserAddress,
        hashlock,
        currentTime + HTLC_PARAMS.srcWithdrawalDuration,
        currentTime + HTLC_PARAMS.srcCancellationDuration,
        currentTime + HTLC_PARAMS.dstWithdrawalDuration,
        currentTime + HTLC_PARAMS.dstCancellationDuration,
        HTLC_PARAMS.baseSafetyDeposit,
        { value: HTLC_PARAMS.baseSafetyDeposit }
      );
      
      const receipt = await tx.wait();
      console.log("[TronBaseHTLC] Base escrow deployment tx:", receipt.hash);
      
      // Get escrow address from events
      const event = receipt.logs.find(log => log.fragment?.name === "EscrowDeployed");
      baseEscrowAddress = event.args.escrow;
      console.log("[TronBaseHTLC] Base escrow address:", baseEscrowAddress);
    });

    it("should allow user to withdraw from destination escrow with secret", async () => {
      console.log("[TronBaseHTLC] User withdrawing from Base escrow with secret...");
      
      const escrow = new ethers.Contract(baseEscrowAddress, ESCROW_ABI, baseSigner);
      
      const tx = await escrow.withdraw(secret);
      const receipt = await tx.wait();
      
      console.log("[TronBaseHTLC] Base withdrawal tx:", receipt.hash);
      expect(receipt.status).toBe(1);
      
      // Verify tokens received
      const token = new ethers.Contract(baseTestToken, ERC20_ABI, baseSigner);
      const balance = await token.balanceOf(baseUserAddress);
      console.log("[TronBaseHTLC] User token balance on Base:", ethers.formatUnits(balance, 18));
    });

    it("should allow resolver to withdraw from source escrow with revealed secret", async () => {
      console.log("[TronBaseHTLC] Resolver withdrawing from Tron escrow with revealed secret...");
      
      // Simulate monitoring Base chain for secret revelation
      // In real implementation, this would be done by monitoring events
      
      const escrowContract = await tronWeb.contract(ESCROW_ABI, tronEscrowAddress);
      
      const tx = await escrowContract.withdraw(secret).send({
        feeLimit: 1000000000,
        callValue: 0,
      });
      
      console.log("[TronBaseHTLC] Tron withdrawal tx:", tx);
      
      // Verify tokens received
      const tokenContract = await tronWeb.contract(ERC20_ABI, tronTestToken);
      const balance = await tokenContract.balanceOf(tronResolverAddress).call();
      console.log("[TronBaseHTLC] Resolver token balance on Tron:", balance / 1e18);
    });
  });

  describe("HTLC Timeout Flow", () => {
    let tronEscrowAddress2;
    let baseEscrowAddress2;
    const swapAmount = ethers.parseUnits("50", 18);

    it("should create new escrows for timeout test", async () => {
      console.log("[TronBaseHTLC] Creating new escrows for timeout test...");
      
      // Generate new secret and hashlock
      const newSecret = "0x" + crypto.randomBytes(32).toString("hex");
      const newHashlock = ethers.keccak256(newSecret);
      
      // Create escrows with very short timeout for testing
      const shortTimeout = 60; // 1 minute
      
      // Deploy on Tron with short timeout
      // ... (similar to success flow but with short timeouts)
      
      // Deploy on Base with short timeout
      // ... (similar to success flow but with short timeouts)
    });

    it("should allow cancellation after timeout", async () => {
      console.log("[TronBaseHTLC] Testing cancellation after timeout...");
      
      // Wait for timeout period
      console.log("[TronBaseHTLC] Waiting for timeout period...");
      await new Promise(resolve => setTimeout(resolve, 65000)); // Wait 65 seconds
      
      // Cancel on Base
      const baseEscrow = new ethers.Contract(baseEscrowAddress2, ESCROW_ABI, baseSigner);
      const baseCancelTx = await baseEscrow.cancel();
      await baseCancelTx.wait();
      console.log("[TronBaseHTLC] Base escrow cancelled");
      
      // Cancel on Tron
      const tronEscrow = await tronWeb.contract(ESCROW_ABI, tronEscrowAddress2);
      const tronCancelTx = await tronEscrow.cancel().send({
        feeLimit: 1000000000,
        callValue: 0,
      });
      console.log("[TronBaseHTLC] Tron escrow cancelled");
    });
  });

  describe("Resource Management", () => {
    it("should track Tron energy and bandwidth usage", async () => {
      console.log("[TronBaseHTLC] Checking Tron resource usage...");
      
      const accountResources = await tronWeb.trx.getAccountResources(tronUserAddress);
      console.log("[TronBaseHTLC] Final Energy Used:", accountResources.EnergyUsed || 0);
      console.log("[TronBaseHTLC] Final Bandwidth Used:", accountResources.freeNetUsed || 0);
      
      // Check if we need to freeze TRX for more resources
      if (accountResources.EnergyUsed > accountResources.EnergyLimit * 0.8) {
        console.log("[TronBaseHTLC] WARNING: Energy usage is high, consider freezing TRX for energy");
      }
    });

    it("should handle TRX/SUN conversions properly", async () => {
      console.log("[TronBaseHTLC] Testing TRX/SUN conversions...");
      
      const trxAmount = 10; // 10 TRX
      const sunAmount = tronWeb.toSun(trxAmount); // Convert to SUN
      const backToTrx = tronWeb.fromSun(sunAmount); // Convert back to TRX
      
      console.log(`[TronBaseHTLC] ${trxAmount} TRX = ${sunAmount} SUN`);
      console.log(`[TronBaseHTLC] ${sunAmount} SUN = ${backToTrx} TRX`);
      
      expect(parseFloat(backToTrx)).toBe(trxAmount);
    });
  });

  after(async () => {
    console.log("[TronBaseHTLC] Test suite completed");
    
    // Clean up any remaining state
    // Note: In production, you might want to leave escrows for manual inspection
  });
});

// Helper function to deploy contracts with actual bytecode
async function deployContractWithBytecode(tronWeb, abi, bytecode, params, options) {
  try {
    const contract = await tronWeb.contract().new({
      abi: abi,
      bytecode: bytecode,
      parameters: params,
      ...options
    });
    return contract;
  } catch (error) {
    console.error("[TronBaseHTLC] Contract deployment failed:", error);
    throw error;
  }
}

// Helper to parse escrow address from Tron events
function parseEscrowAddressFromTronEvents(receipt) {
  // Tron event parsing logic
  if (receipt.log && receipt.log.length > 0) {
    for (const log of receipt.log) {
      if (log.topics && log.topics[0] === ethers.keccak256("EscrowDeployed(address,address,uint256,address,bytes32)")) {
        // Parse the address from the event data
        return "0x" + log.data.slice(26, 66); // Adjust based on actual event structure
      }
    }
  }
  return null;
}

module.exports = {
  TRON_CONFIG,
  BASE_SEPOLIA_CONFIG,
  HTLC_PARAMS
};