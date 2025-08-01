import dotenv from "dotenv";
import { XRPEscrow } from "../src/escrow";

dotenv.config();

async function main() {
  const escrow = new XRPEscrow(process.env.XRP_SERVER_URL);
  
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error("[FulfillEscrow] Usage: npm run escrow:fulfill <escrow_creator_address> <escrow_sequence> [fulfillment]");
      process.exit(1);
    }
    
    const escrowCreator = args[0];
    const escrowSequence = parseInt(args[1]);
    const fulfillment = args[2]; // Optional for non-conditional escrows
    
    console.log("[FulfillEscrow] Attempting to fulfill escrow:");
    console.log("[FulfillEscrow] Creator:", escrowCreator);
    console.log("[FulfillEscrow] Sequence:", escrowSequence);
    if (fulfillment) {
      console.log("[FulfillEscrow] Fulfillment:", fulfillment);
    }
    
    const result = await escrow.fulfillEscrow(
      process.env.XRP_DESTINATION_ADDRESS!, // The destination fulfills the escrow
      process.env.XRP_DESTINATION_SECRET!,
      escrowCreator,
      escrowSequence,
      fulfillment
    );
    
    if (result.success) {
      console.log("[FulfillEscrow] Success!");
      console.log("[FulfillEscrow] Transaction hash:", result.txHash);
      console.log("[FulfillEscrow] Ledger index:", result.ledgerIndex);
    } else {
      console.error("[FulfillEscrow] Failed:", result.error);
    }
  } catch (error) {
    console.error("[FulfillEscrow] Error:", error);
  } finally {
    await escrow.disconnect();
  }
}

main().catch(console.error);