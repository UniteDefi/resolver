import dotenv from "dotenv";
import { XRPEscrow } from "../src/escrow";
import { xrpToDrops } from "xrpl";

dotenv.config();

async function main() {
  const escrow = new XRPEscrow(process.env.XRP_SERVER_URL);
  
  try {
    // Generate condition and fulfillment for conditional escrow
    const { condition, fulfillment } = escrow.generateConditionAndFulfillment();
    
    console.log("[CreateEscrow] Generated condition:", condition);
    console.log("[CreateEscrow] Generated fulfillment:", fulfillment);
    
    // Create escrow with 1 XRP (keeping some for transaction fees)
    const result = await escrow.createEscrow({
      sourceAddress: process.env.XRP_SOURCE_ADDRESS!,
      sourceSecret: process.env.XRP_SOURCE_SECRET!,
      destinationAddress: process.env.XRP_DESTINATION_ADDRESS!,
      amount: xrpToDrops("1"), // 1 XRP
      condition: condition,
      finishAfter: Math.floor(Date.now() / 1000) + 300, // Can be finished after 5 minutes
      cancelAfter: Math.floor(Date.now() / 1000) + 86400, // Can be cancelled after 24 hours
    });
    
    if (result.success) {
      console.log("[CreateEscrow] Success!");
      console.log("[CreateEscrow] Transaction hash:", result.txHash);
      console.log("[CreateEscrow] Ledger index:", result.ledgerIndex);
      console.log("[CreateEscrow] Save this fulfillment to finish the escrow:", fulfillment);
    } else {
      console.error("[CreateEscrow] Failed:", result.error);
    }
  } catch (error) {
    console.error("[CreateEscrow] Error:", error);
  } finally {
    await escrow.disconnect();
  }
}

main().catch(console.error);