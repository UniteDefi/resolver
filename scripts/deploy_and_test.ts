import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Configuration
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY!;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY || process.env.TEST_USER_PRIVATE_KEY || DEPLOYER_PRIVATE_KEY;
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER1_WALLET_PRIVATE_KEY!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;
const RELAYER_URL = "http://localhost:3000";

// Chain configurations
const chains = {
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://base-sepolia.blockscout.com",
    tokens: {
      USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
      DAI: "0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9"
    }
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    blockExplorer: "https://arbitrum-sepolia.blockscout.com",
    tokens: {
      USDT: "0xf3c3351D6Bd0098EEb7C6E0f7D26B4874D89a4DB",
      DAI: "0xc34aeFEa232956542C5b2f2EE55fD5c378B35c03"
    }
  }
};

// MockRelayer contract bytecode (simplified)
const MOCK_RELAYER_BYTECODE = "0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506001600160003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff0219169083151502179055506109f1806100b96000396000f3fe608060405234801561001057600080fd5b50600436106100625760003560e01c80631de61a4b146100675780634c60588014610083578063738fb4f9146100b35780637a5f4e27146100cf5780638da5cb5b146100eb578063c513169114610109575b600080fd5b610081600480360381019061007c91906106d3565b610139565b005b61009d60048036038101906100989190610730565b6102f5565b6040516100aa9190610792565b60405180910390f35b6100cd60048036038101906100c891906107ad565b610373565b005b6100e960048036038101906100e491906107ad565b6104d6565b005b6100f36105b9565b6040516101009190610801565b60405180910390f35b610123600480360381019061011e91906107ad565b6105dd565b6040516101309190610792565b60405180910390f35b600160003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff16806101da57506000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16145b610219576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161021090610878565b60405180910390fd5b60008473ffffffffffffffffffffffffffffffffffffffff166370a08231856040518263ffffffff1660e01b815260040161025491906108a7565b602060405180830381865afa158015610271573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061029591906108d7565b9050828110156102a457600080fd5b8473ffffffffffffffffffffffffffffffffffffffff166323b872dd8585866040518463ffffffff1660e01b81526004016102e193929190610904565b600060405180830381600087803b1580156102fb57600080fd5b505af115801561030f573d6000803e3d6000fd5b505050508273ffffffffffffffffffffffffffffffffffffffff168573ffffffffffffffffffffffffffffffffffffffff167f8c1b2a7b2e3f5a6d9c4f7e8a9b1d3c5f6e7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d8660405161036f919061093b565b60405180910390a35050505050565b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610402576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016103f9906109a2565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16036104785760008054906101000a900473ffffffffffffffffffffffffffffffffffffffff166108fc479081150290604051600060405180830381858888f193505050501580156104725760003c6d6000fd5b506104d3565b60008173ffffffffffffffffffffffffffffffffffffffff166370a08231306040518263ffffffff1660e01b81526004016104b391906108a7565b602060405180830381865afa1580156104d0573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906104f491906108d7565b9050600081111561057d578173ffffffffffffffffffffffffffffffffffffffff1663a9059cbb6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff16836040518363ffffffff1660e01b815260040161055b9291906109c2565b600060405180830381600087803b15801561057557600080fd5b505af1158015610589573d6000803e3d6000fd5b505050505b5050565b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600160205280600052604060002060009150905054906101000a900460ff1681565b600080600090506000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16148061068757506001600160003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff165b6106915760006106c9565b6001915050919050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006106cb826106a0565b9050919050565b60006106dd826106c0565b9050919050565b6106ed816106d2565b81146106f857600080fd5b50565b60008135905061070a816106e4565b92915050565b6000819050919050565b61072381610710565b811461072e57600080fd5b50565b6000813590506107408161071a565b92915050565b60008060006060848603121561075f5761075e61069b565b5b600061076d868287016106fb565b935050602061077e868287016106fb565b925050604061078f86828701610731565b9150509250925092565b60008115159050919050565b6107ae81610799565b82525050565b6000602082840312156107ca576107c961069b565b5b60006107d8848285016106fb565b91505092915050565b6107ea816106c0565b82525050565b6107f981610799565b82525050565b600060208201905061081460008301846107e1565b92915050565b600082825260208201905092915050565b7f556e617574686f72697a65640000000000000000000000000000000000000000600082015250565b6000610861600c8361081a565b915061086c8261082b565b602082019050919050565b6000602082019050818103600083015261089081610854565b9050919050565b6108a0816106c0565b82525050565b60006020820190506108bb6000830184610897565b92915050565b6000815190506108d08161071a565b92915050565b6000602082840312156108ec576108eb61069b565b5b60006108fa848285016108c1565b91505092915050565b60006060820190506109186000830186610897565b6109256020830185610897565b6109326040830184610939565b949350505050565b600060208201905061094f60008301846109a3565b92915050565b7f4f6e6c79206f776e657200000000000000000000000000000000000000000000600082015250565b600061098b600a8361081a565b915061099682610955565b602082019050919050565b600060208201905081810360008301526109ba8161097e565b9050919050565b60006040820190506109d66000830185610897565b6109e36020830184610939565b9392505050565b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b610a39826109ef565b810181811067ffffffffffffffff82111715610a5857610a57610a00565b5b80604052505050565b6000610a6b610691565b9050610a778282610a30565b919050565b600067ffffffffffffffff821115610a9757610a96610a00565b5b602082029050602081019050919050565b600080fd5b6000610ac0610abb84610a7c565b610a61565b90508083825260208201905060208402830185811115610ae357610ae2610aa8565b5b835b81811015610b0c5780610af888826106fb565b845260208401935050602081019050610ae5565b5050509392505050565b600082601f830112610b2b57610b2a6109ea565b5b8135610b3b848260208601610aad565b91505092915050565b600060208284031215610b5a57610b5961069b565b5b600082013567ffffffffffffffff811115610b7857610b776106a0565b5b610b8484828501610b16565b91505092915050565b600081519050919050565b600082825260208201905092915050565b60005b83811015610bc8578082015181840152602081019050610bad565b60008484015250505050565b6000610bdf82610b8d565b610be98185610b98565b9350610bf9818560208601610baa565b610c02816109ef565b840191505092915050565b600060208201905081810360008301525b92915050565b610c2e816106c0565b82525050565b610c3d81610799565b82525050565b60006040820190508181036000830152610c5d8185610bd4565b9050610c6c6020830184610c34565b9392505050565bfea2646970667358221220c5e3f9e5a8b7d4f2c1e9a6b3d5f7e8c4a9b2d6e1f3a5c7b9d8e2f4a6c8b1d3e564736f6c63430008170033";

// MockRelayer ABI
const MOCK_RELAYER_ABI = [
  "constructor()",
  "function authorizeRelayer(address relayer) external",
  "function transferUserFunds(address user, address token, uint256 amount, address escrow) external returns (bool)",
  "function checkUserApproval(address user, address token, uint256 amount) external view returns (bool)",
  "function owner() external view returns (address)",
  "event UserFundsTransferred(address indexed user, address indexed token, uint256 amount, address indexed escrow)"
];

// ERC20 ABI
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

class ComprehensiveTest {
  private report: any = {
    deployments: {},
    transactions: [],
    apiCalls: [],
    orderDetails: {},
    errors: []
  };
  
  async run() {
    console.log("🚀 Starting Comprehensive Cross-Chain Swap Test\n");
    console.log("=" .repeat(60));
    
    try {
      // Step 1: Deploy Mock Relayer Contracts
      await this.deployRelayerContracts();
      
      // Step 2: Setup and run cross-chain swap
      await this.runCrossChainSwap();
      
      // Step 3: Generate report
      await this.generateReport();
      
    } catch (error: any) {
      console.error("❌ Test failed:", error.message);
      this.report.errors.push({
        step: "main",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async deployRelayerContracts() {
    console.log("\n📋 STEP 1: Deploying Mock Relayer Contracts");
    console.log("-".repeat(40));
    
    for (const [chainKey, chain] of Object.entries(chains)) {
      console.log(`\n🔗 Deploying on ${chain.name}...`);
      
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
      
      console.log(`Deployer: ${deployer.address}`);
      
      try {
        // Deploy MockRelayer
        const factory = new ethers.ContractFactory(MOCK_RELAYER_ABI, MOCK_RELAYER_BYTECODE, deployer);
        const contract = await factory.deploy();
        const deployTx = contract.deploymentTransaction();
        
        console.log(`Deploy TX: ${deployTx?.hash}`);
        this.report.transactions.push({
          type: "CONTRACT_DEPLOYMENT",
          chain: chain.name,
          txHash: deployTx?.hash,
          from: deployer.address,
          contractType: "MockRelayer",
          timestamp: new Date().toISOString()
        });
        
        await contract.waitForDeployment();
        const address = await contract.getAddress();
        
        console.log(`✅ Deployed at: ${address}`);
        console.log(`🔍 View on Blockscout: ${chain.blockExplorer}/address/${address}`);
        
        this.report.deployments[chainKey] = {
          chainId: chain.chainId,
          chainName: chain.name,
          relayerContract: address,
          deployer: deployer.address,
          blockExplorer: `${chain.blockExplorer}/address/${address}`
        };
        
        // Authorize relayer service
        const relayerWallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY, provider);
        console.log(`\nAuthorizing relayer service: ${relayerWallet.address}`);
        
        const authTx = await contract.authorizeRelayer(relayerWallet.address);
        console.log(`Auth TX: ${authTx.hash}`);
        await authTx.wait();
        
        this.report.transactions.push({
          type: "AUTHORIZE_RELAYER",
          chain: chain.name,
          txHash: authTx.hash,
          from: deployer.address,
          to: address,
          relayerAddress: relayerWallet.address,
          timestamp: new Date().toISOString()
        });
        
      } catch (error: any) {
        console.error(`❌ Failed to deploy on ${chain.name}:`, error.message);
        this.report.errors.push({
          step: "deployment",
          chain: chain.name,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Save deployments
    const deploymentsPath = path.join(__dirname, "../mock_relayer_deployments.json");
    fs.writeFileSync(deploymentsPath, JSON.stringify(this.report.deployments, null, 2));
    console.log(`\n💾 Deployments saved to: ${deploymentsPath}`);
  }
  
  async runCrossChainSwap() {
    console.log("\n\n📋 STEP 2: Running Cross-Chain Swap");
    console.log("-".repeat(40));
    
    // Setup providers and wallets
    const baseProvider = new ethers.JsonRpcProvider(chains.baseSepolia.rpcUrl);
    const arbitrumProvider = new ethers.JsonRpcProvider(chains.arbitrumSepolia.rpcUrl);
    
    const userWalletBase = new ethers.Wallet(USER_PRIVATE_KEY, baseProvider);
    const userWalletArbitrum = new ethers.Wallet(USER_PRIVATE_KEY, arbitrumProvider);
    
    console.log(`\n👤 User Address: ${userWalletBase.address}`);
    
    // Check initial balances
    const srcToken = new ethers.Contract(chains.baseSepolia.tokens.USDT, ERC20_ABI, userWalletBase);
    const dstToken = new ethers.Contract(chains.arbitrumSepolia.tokens.DAI, ERC20_ABI, userWalletArbitrum);
    
    const srcBalanceBefore = await srcToken.balanceOf(userWalletBase.address);
    const dstBalanceBefore = await dstToken.balanceOf(userWalletBase.address);
    
    console.log(`\n💰 Initial Balances:`);
    console.log(`Base Sepolia USDT: ${ethers.formatUnits(srcBalanceBefore, 6)}`);
    console.log(`Arbitrum Sepolia DAI: ${ethers.formatUnits(dstBalanceBefore, 6)}`);
    
    if (srcBalanceBefore === 0n) {
      throw new Error("No USDT balance. Please fund the test wallet.");
    }
    
    // Approve relayer contract
    const relayerAddress = this.report.deployments.baseSepolia.relayerContract;
    const swapAmount = ethers.parseUnits("10", 6); // 10 USDT
    
    console.log(`\n✍️ Approving ${ethers.formatUnits(swapAmount, 6)} USDT to relayer...`);
    console.log(`Relayer Contract: ${relayerAddress}`);
    
    const approveTx = await srcToken.approve(relayerAddress, swapAmount);
    console.log(`Approval TX: ${approveTx.hash}`);
    console.log(`🔍 View on Blockscout: ${chains.baseSepolia.blockExplorer}/tx/${approveTx.hash}`);
    
    this.report.transactions.push({
      type: "TOKEN_APPROVAL",
      chain: "Base Sepolia",
      txHash: approveTx.hash,
      from: userWalletBase.address,
      to: chains.baseSepolia.tokens.USDT,
      spender: relayerAddress,
      amount: swapAmount.toString(),
      timestamp: new Date().toISOString()
    });
    
    await approveTx.wait();
    console.log("✅ Approval confirmed");
    
    // Generate secret
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(secret);
    
    console.log(`\n🔐 Order Details:`);
    console.log(`Secret: ${ethers.hexlify(secret)}`);
    console.log(`Secret Hash: ${secretHash}`);
    
    this.report.orderDetails = {
      secret: ethers.hexlify(secret),
      secretHash: secretHash,
      srcChain: "Base Sepolia",
      dstChain: "Arbitrum Sepolia",
      srcToken: "USDT",
      dstToken: "DAI",
      amount: ethers.formatUnits(swapAmount, 6),
      userAddress: userWalletBase.address
    };
    
    // Create swap order via API
    const swapRequest = {
      userAddress: userWalletBase.address,
      signature: "0x", // Simplified
      srcChainId: chains.baseSepolia.chainId,
      srcToken: chains.baseSepolia.tokens.USDT,
      srcAmount: swapAmount.toString(),
      dstChainId: chains.arbitrumSepolia.chainId,
      dstToken: chains.arbitrumSepolia.tokens.DAI,
      secretHash: secretHash,
      minAcceptablePrice: ethers.parseUnits("9.5", 6).toString(),
      orderDuration: 300
    };
    
    console.log(`\n📤 Creating swap order via API...`);
    
    try {
      // Check if relayer is running
      await axios.get(`${RELAYER_URL}/health`);
      
      // Create order
      const createResponse = await axios.post(`${RELAYER_URL}/api/create-swap`, {
        swapRequest,
        secret: ethers.hexlify(secret)
      });
      
      this.report.apiCalls.push({
        type: "CREATE_SWAP",
        endpoint: "/api/create-swap",
        request: { swapRequest, secretProvided: true },
        response: createResponse.data,
        timestamp: new Date().toISOString()
      });
      
      const orderId = createResponse.data.orderId;
      console.log(`✅ Order created!`);
      console.log(`Order ID: ${orderId}`);
      console.log(`Market Price: ${ethers.formatUnits(createResponse.data.marketPrice, 6)} DAI`);
      
      this.report.orderDetails.orderId = orderId;
      this.report.orderDetails.marketPrice = ethers.formatUnits(createResponse.data.marketPrice, 6);
      
      // Monitor order
      console.log(`\n⏳ Monitoring order status...`);
      await this.monitorOrderStatus(orderId);
      
      // Check final balances
      console.log(`\n📊 Final Balances:`);
      const srcBalanceAfter = await srcToken.balanceOf(userWalletBase.address);
      const dstBalanceAfter = await dstToken.balanceOf(userWalletBase.address);
      
      console.log(`Base Sepolia USDT: ${ethers.formatUnits(srcBalanceAfter, 6)}`);
      console.log(`Arbitrum Sepolia DAI: ${ethers.formatUnits(dstBalanceAfter, 6)}`);
      
      const srcSpent = srcBalanceBefore - srcBalanceAfter;
      const dstReceived = dstBalanceAfter - dstBalanceBefore;
      
      this.report.orderDetails.result = {
        srcSpent: ethers.formatUnits(srcSpent, 6),
        dstReceived: ethers.formatUnits(dstReceived, 6),
        success: srcSpent > 0n && dstReceived > 0n
      };
      
    } catch (error: any) {
      console.error("❌ API Error:", error.response?.data || error.message);
      this.report.errors.push({
        step: "swap",
        error: error.response?.data || error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async monitorOrderStatus(orderId: string) {
    const startTime = Date.now();
    let lastStatus = "";
    
    while ((Date.now() - startTime) < 120000) { // 2 min timeout for testing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        const statusResponse = await axios.get(`${RELAYER_URL}/api/order-status/${orderId}`);
        const status = statusResponse.data;
        
        if (status.status !== lastStatus) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`[${elapsed}s] Status: ${status.status}`);
          
          this.report.apiCalls.push({
            type: "ORDER_STATUS",
            endpoint: `/api/order-status/${orderId}`,
            response: status,
            timestamp: new Date().toISOString()
          });
          
          if (status.resolver) {
            console.log(`  → Resolver: ${status.resolver}`);
          }
          
          if (status.srcEscrowAddress) {
            console.log(`  → Src Escrow: ${status.srcEscrowAddress}`);
            console.log(`  🔍 View: ${chains.baseSepolia.blockExplorer}/address/${status.srcEscrowAddress}`);
          }
          
          if (status.dstEscrowAddress) {
            console.log(`  → Dst Escrow: ${status.dstEscrowAddress}`);
            console.log(`  🔍 View: ${chains.arbitrumSepolia.blockExplorer}/address/${status.dstEscrowAddress}`);
          }
          
          lastStatus = status.status;
        }
        
        if (status.status === "completed" || status.status === "failed") {
          break;
        }
      } catch (error) {
        console.error("Status check error:", error);
      }
    }
  }
  
  async generateReport() {
    console.log("\n\n📊 TEST REPORT");
    console.log("=".repeat(60));
    
    console.log("\n1. CONTRACT DEPLOYMENTS:");
    for (const [chain, deployment] of Object.entries(this.report.deployments)) {
      console.log(`\n${deployment.chainName}:`);
      console.log(`  Contract: ${deployment.relayerContract}`);
      console.log(`  Explorer: ${deployment.blockExplorer}`);
    }
    
    console.log("\n2. TRANSACTIONS:");
    for (const tx of this.report.transactions) {
      console.log(`\n${tx.type} on ${tx.chain}:`);
      console.log(`  TX Hash: ${tx.txHash}`);
      console.log(`  From: ${tx.from}`);
      if (tx.to) console.log(`  To: ${tx.to}`);
    }
    
    console.log("\n3. ORDER DETAILS:");
    console.log(`  Order ID: ${this.report.orderDetails.orderId}`);
    console.log(`  Secret Hash: ${this.report.orderDetails.secretHash}`);
    console.log(`  Amount: ${this.report.orderDetails.amount} USDT`);
    console.log(`  Market Price: ${this.report.orderDetails.marketPrice} DAI`);
    
    if (this.report.orderDetails.result) {
      console.log("\n4. SWAP RESULT:");
      console.log(`  Sent: ${this.report.orderDetails.result.srcSpent} USDT`);
      console.log(`  Received: ${this.report.orderDetails.result.dstReceived} DAI`);
      console.log(`  Success: ${this.report.orderDetails.result.success ? "✅" : "❌"}`);
    }
    
    console.log("\n5. API CALLS MADE:");
    console.log(`  Total: ${this.report.apiCalls.length}`);
    for (const call of this.report.apiCalls) {
      console.log(`  - ${call.type}: ${call.endpoint || "N/A"}`);
    }
    
    if (this.report.errors.length > 0) {
      console.log("\n6. ERRORS:");
      for (const error of this.report.errors) {
        console.log(`  - ${error.step}: ${error.error}`);
      }
    }
    
    // Save full report
    const reportPath = path.join(__dirname, "../test_report_" + Date.now() + ".json");
    fs.writeFileSync(reportPath, JSON.stringify(this.report, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);
  }
}

// Run the test
const test = new ComprehensiveTest();
test.run().catch(console.error);