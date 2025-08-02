import { CrossChainCoordinator } from "../src/resolver/CrossChainCoordinator";
import { XRPLHTLCFactory } from "../src/htlc/XRPLHTLCFactory";
import { ResolverConfig } from "../src/resolver/types";
import { Wallet } from "xrpl";
import dotenv from "dotenv";

dotenv.config();

interface DeploymentResult {
  success: boolean;
  components: string[];
  wallets: string[];
  error?: string;
}

async function deployXRPLBridge(): Promise<DeploymentResult> {
  console.log("🚀 Deploying XRPL Cross-Chain Bridge Components");
  
  try {
    // Initialize core components
    const coordinator = new CrossChainCoordinator(process.env.XRP_SERVER_URL);
    const htlcFactory = new XRPLHTLCFactory(process.env.XRP_SERVER_URL);
    
    console.log("✅ Initialized core components");

    // Setup resolver configuration
    const resolverConfigs: ResolverConfig[] = [
      {
        address: process.env.XRP_RESOLVER_0_ADDRESS!,
        secret: process.env.XRP_RESOLVER_0_SECRET!,
        name: "Primary Resolver",
        maxCommitmentXRP: "1000",
        safetyDepositRatio: 2
      },
      {
        address: process.env.XRP_RESOLVER_1_ADDRESS!,
        secret: process.env.XRP_RESOLVER_1_SECRET!,
        name: "Secondary Resolver", 
        maxCommitmentXRP: "750",
        safetyDepositRatio: 2
      },
      {
        address: process.env.XRP_RESOLVER_2_ADDRESS!,
        secret: process.env.XRP_RESOLVER_2_SECRET!,
        name: "Tertiary Resolver",
        maxCommitmentXRP: "500", 
        safetyDepositRatio: 2
      }
    ];

    // Add resolvers to coordinator
    resolverConfigs.forEach(config => {
      coordinator.getResolverManager().addResolver(config);
    });

    console.log("✅ Configured resolvers");

    // Connect to XRPL
    await coordinator.getResolverManager().connectAll();
    await htlcFactory.connect();

    console.log("✅ Connected to XRPL testnet");

    // Verify resolver balances
    console.log("\n💰 Checking resolver balances...");
    const balances = await coordinator.getResolverManager().getAllBalances();
    
    const insufficientFunds: string[] = [];
    Object.entries(balances).forEach(([address, balance]) => {
      console.log(`${address}: ${balance} XRP`);
      if (parseFloat(balance) < 10) {
        insufficientFunds.push(address);
      }
    });

    if (insufficientFunds.length > 0) {
      console.log("\n⚠️  Warning: Some resolvers have insufficient funds:");
      insufficientFunds.forEach(address => {
        console.log(`   ${address} needs more XRP`);
      });
      console.log("   Fund wallets at: https://xrpl.org/xrp-testnet-faucet.html");
    }

    // Test basic functionality
    console.log("\n🧪 Testing basic functionality...");
    const testSecret = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const { condition, fulfillment } = htlcFactory.generateHTLCCondition(testSecret);
    
    console.log("✅ HTLC condition generation working");
    console.log(`   Condition: ${condition.substring(0, 20)}...`);
    console.log(`   Fulfillment: ${fulfillment.substring(0, 20)}...`);

    // Cleanup
    await coordinator.cleanup();
    await htlcFactory.disconnect();

    return {
      success: true,
      components: [
        "CrossChainCoordinator",
        "XRPLHTLCFactory", 
        "XRPLResolverManager",
        "XRPLResolver (x3)"
      ],
      wallets: Object.keys(balances)
    };

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    return {
      success: false,
      components: [],
      wallets: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

if (require.main === module) {
  deployXRPLBridge()
    .then(result => {
      if (result.success) {
        console.log("\n🎉 XRPL Bridge Deployment Successful!");
        console.log("Components deployed:", result.components.join(", "));
        console.log("Wallets configured:", result.wallets.length);
        console.log("\n🚀 Ready for cross-chain operations!");
      } else {
        console.log("\n❌ Deployment failed:", result.error);
        process.exit(1);
      }
    })
    .catch(console.error);
}

export { deployXRPLBridge };
