import dotenv from "dotenv";
import { XRPEscrow } from "../src/escrow";

dotenv.config();

async function main() {
  const escrow = new XRPEscrow(process.env.XRP_SERVER_URL);
  
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error("[CancelEscrow] Usage: npm run escrow:cancel <escrow_creator_address> <escrow_sequence>");
      process.exit(1);
    }
    
    const escrowCreator = args[0];
    const escrowSequence = parseInt(args[1]);
    
    console.log("[CancelEscrow] Attempting to cancel escrow:");
    console.log("[CancelEscrow] Creator:", escrowCreator);
    console.log("[CancelEscrow] Sequence:", escrowSequence);
    
    const result = await escrow.cancelEscrow(
      process.env.XRP_SOURCE_ADDRESS!, // The creator cancels the escrow
      process.env.XRP_SOURCE_SECRET!,
      escrowCreator,
      escrowSequence
    );
    
    if (result.success) {
      console.log("[CancelEscrow] Success!");
      console.log("[CancelEscrow] Transaction hash:", result.txHash);
      console.log("[CancelEscrow] Ledger index:", result.ledgerIndex);
    } else {
      console.error("[CancelEscrow] Failed:", result.error);
    }
  } catch (error) {
    console.error("[CancelEscrow] Error:", error);
  } finally {
    await escrow.disconnect();
  }
}

main().catch(console.error);