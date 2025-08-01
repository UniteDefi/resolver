import dotenv from "dotenv";
import { XRPEscrow } from "../src/escrow";

dotenv.config();

async function main() {
  const escrow = new XRPEscrow(process.env.XRP_SERVER_URL);
  
  try {
    await escrow.connect();
    
    console.log("[ListEscrows] Checking escrows for source account...");
    const sourceEscrows = await escrow.getEscrows(process.env.XRP_SOURCE_ADDRESS!);
    
    if (sourceEscrows.length > 0) {
      console.log(`\n[ListEscrows] Found ${sourceEscrows.length} escrow(s) from source account:`);
      sourceEscrows.forEach((esc, index) => {
        console.log(`\nEscrow ${index + 1}:`);
        console.log(`  Destination: ${esc.destination}`);
        console.log(`  Amount: ${parseInt(esc.amount) / 1000000} XRP`);
        console.log(`  Condition: ${esc.condition || "None (time-based only)"}`);
        if (esc.finishAfter) {
          const finishDate = new Date((esc.finishAfter + 946684800) * 1000);
          console.log(`  FinishAfter: ${finishDate.toLocaleString()}`);
        }
        if (esc.cancelAfter) {
          const cancelDate = new Date((esc.cancelAfter + 946684800) * 1000);
          console.log(`  CancelAfter: ${cancelDate.toLocaleString()}`);
        }
        console.log(`  Previous TxID: ${esc.previousTxnID}`);
        console.log(`  Sequence: ${esc.previousTxnLgrSeq}`);
      });
    } else {
      console.log("[ListEscrows] No escrows found from source account");
    }
    
  } catch (error) {
    console.error("[ListEscrows] Error:", error);
  } finally {
    await escrow.disconnect();
  }
}

main().catch(console.error);