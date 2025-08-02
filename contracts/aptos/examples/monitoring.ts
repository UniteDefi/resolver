import { AptosClient } from "aptos";
import * as dotenv from "dotenv";

dotenv.config();

const NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.testnet.aptoslabs.com";

interface Stats {
  escrowCount: number;
  orderCount: number;
  resolverCount: number;
  activeResolvers: number;
  totalSwapsResolved: number;
}

async function monitoringExample() {
  console.log("📊 Unite DeFi Monitoring Dashboard\n");

  const client = new AptosClient(NODE_URL);
  const moduleAddress = process.env.APTOS_MODULE_ADDRESS;

  if (!moduleAddress) {
    console.error("❌ Please set APTOS_MODULE_ADDRESS in your .env file");
    process.exit(1);
  }

  console.log("🔍 Module Address:", moduleAddress);
  console.log("🌐 Network:", NODE_URL);

  // Continuous monitoring loop
  let iteration = 0;
  
  while (true) {
    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📅 Update #${++iteration} - ${new Date().toLocaleString()}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Collect statistics
      const stats = await collectStats(client, moduleAddress);

      // Display dashboard
      displayDashboard(stats);

      // Check for alerts
      checkAlerts(stats);

      // Monitor events (last 10 blocks)
      await monitorRecentEvents(client, moduleAddress);

      // Wait before next update
      console.log("\n⏳ Next update in 30 seconds...");
      await sleep(30000);

    } catch (error) {
      console.error("❌ Monitoring error:", error.message);
      console.log("🔄 Retrying in 10 seconds...");
      await sleep(10000);
    }
  }
}

async function collectStats(client: AptosClient, moduleAddress: string): Promise<Stats> {
  const [escrowCount, orderCount, resolverCount] = await Promise.all([
    client.view({
      function: `${moduleAddress}::escrow_factory::get_escrow_count`,
      type_arguments: [],
      arguments: [],
    }),
    client.view({
      function: `${moduleAddress}::limit_order_protocol::get_order_count`,
      type_arguments: [],
      arguments: [],
    }),
    client.view({
      function: `${moduleAddress}::resolver::get_resolver_count`,
      type_arguments: [],
      arguments: [],
    }),
  ]);

  // Get detailed resolver stats
  let activeResolvers = 0;
  let totalSwapsResolved = 0;

  for (let i = 0; i < Number(resolverCount[0]); i++) {
    try {
      // Note: This is a simplified approach. In production, you'd have a better way to iterate resolvers
      const resolverAddress = "0x..."; // Would need to get from registry
      const info = await client.view({
        function: `${moduleAddress}::resolver::get_resolver_info`,
        type_arguments: [],
        arguments: [resolverAddress],
      });

      if (info[2]) activeResolvers++; // is_active
      totalSwapsResolved += Number(info[3]); // total_resolved
    } catch {
      // Skip if resolver not found
    }
  }

  return {
    escrowCount: Number(escrowCount[0]),
    orderCount: Number(orderCount[0]),
    resolverCount: Number(resolverCount[0]),
    activeResolvers,
    totalSwapsResolved,
  };
}

function displayDashboard(stats: Stats) {
  console.log("\n📊 PROTOCOL STATISTICS");
  console.log("├─ 🔐 Total Escrows: " + stats.escrowCount);
  console.log("├─ 📝 Total Orders: " + stats.orderCount);
  console.log("├─ 🤖 Total Resolvers: " + stats.resolverCount);
  console.log("├─ ✅ Active Resolvers: " + stats.activeResolvers);
  console.log("└─ 🔄 Swaps Resolved: " + stats.totalSwapsResolved);

  // Calculate metrics
  const resolverUtilization = stats.resolverCount > 0 
    ? (stats.activeResolvers / stats.resolverCount * 100).toFixed(1)
    : "0";
  
  const avgSwapsPerResolver = stats.resolverCount > 0
    ? (stats.totalSwapsResolved / stats.resolverCount).toFixed(2)
    : "0";

  console.log("\n📈 METRICS");
  console.log("├─ 📊 Resolver Utilization: " + resolverUtilization + "%");
  console.log("└─ 📉 Avg Swaps/Resolver: " + avgSwapsPerResolver);
}

function checkAlerts(stats: Stats) {
  const alerts: string[] = [];

  // Check for low resolver availability
  if (stats.activeResolvers < 3) {
    alerts.push("⚠️  Low resolver availability! Only " + stats.activeResolvers + " active resolvers");
  }

  // Check for high order backlog
  if (stats.orderCount > stats.escrowCount * 2) {
    alerts.push("⚠️  High order backlog detected!");
  }

  // Check for inactive protocol
  if (stats.escrowCount === 0 && stats.orderCount === 0) {
    alerts.push("ℹ️  No active trades or orders");
  }

  if (alerts.length > 0) {
    console.log("\n🚨 ALERTS");
    alerts.forEach(alert => console.log(alert));
  }
}

async function monitorRecentEvents(client: AptosClient, moduleAddress: string) {
  console.log("\n📡 RECENT EVENTS");
  
  try {
    // Get account events
    const account = await client.getAccount(moduleAddress);
    
    // Note: In a real implementation, you would query specific event handles
    // This is a simplified version
    console.log("├─ 🔄 Monitoring blockchain events...");
    console.log("├─ 📦 Last sequence number:", account.sequence_number);
    console.log("└─ ⛓️  Authentication key:", account.authentication_key.slice(0, 10) + "...");

    // You would typically query specific event streams here:
    // - EscrowCreatedEvent
    // - EscrowWithdrawnEvent
    // - OrderCreatedEvent
    // - OrderFilledEvent
    // - ResolverRegisteredEvent
    // - SwapResolvedEvent

  } catch (error) {
    console.log("└─ ❌ Unable to fetch events");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Health check endpoint simulation
async function healthCheck(client: AptosClient, moduleAddress: string): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  details: any;
}> {
  try {
    const stats = await collectStats(client, moduleAddress);
    
    if (stats.activeResolvers === 0) {
      return {
        status: "unhealthy",
        details: { message: "No active resolvers", stats }
      };
    }
    
    if (stats.activeResolvers < 3) {
      return {
        status: "degraded",
        details: { message: "Low resolver count", stats }
      };
    }

    return {
      status: "healthy",
      details: { message: "All systems operational", stats }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      details: { message: "Failed to fetch stats", error: error.message }
    };
  }
}

// Export for use in monitoring services
export { healthCheck, collectStats };

// Run the monitoring dashboard
if (require.main === module) {
  monitoringExample()
    .catch((error) => {
      console.error("❌ Fatal error:", error);
      process.exit(1);
    });
}