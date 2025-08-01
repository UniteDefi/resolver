import dotenv from "dotenv";
import { XRPEscrow } from "../src/escrow";
import { xrpToDrops } from "xrpl";

dotenv.config();

async function main() {
  const escrow = new XRPEscrow(process.env.XRP_SERVER_URL);
  
  try {
    console.log("[SimpleEscrow] Creating simple time-based escrow without condition");
    
    // Create escrow with 0.5 XRP (keeping plenty for fees)
    const result = await escrow.createEscrow({
      sourceAddress: process.env.XRP_SOURCE_ADDRESS!,
      sourceSecret: process.env.XRP_SOURCE_SECRET!,
      destinationAddress: process.env.XRP_DESTINATION_ADDRESS!,
      amount: xrpToDrops("0.5"), // 0.5 XRP
      // No condition - just time based
      finishAfter: Math.floor(Date.now() / 1000) + 60, // Can be finished after 1 minute
      cancelAfter: Math.floor(Date.now() / 1000) + 3600, // Can be cancelled after 1 hour
    });
    
    if (result.success) {
      console.log("[SimpleEscrow] Success!");
      console.log("[SimpleEscrow] Transaction hash:", result.txHash);
      console.log("[SimpleEscrow] Ledger index:", result.ledgerIndex);
    } else {
      console.error("[SimpleEscrow] Failed:", result.error);
    }
  } catch (error) {
    console.error("[SimpleEscrow] Error:", error);
  } finally {
    await escrow.disconnect();
  }
}

main().catch(console.error);