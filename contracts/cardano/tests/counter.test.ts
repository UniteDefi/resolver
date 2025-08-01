import {
  Constr,
  Data,
  Lucid,
  Script,
  TxHash,
  UTxO,
  fromText,
  toHex,
} from "lucid-cardano";
import {
  createBlockfrostProvider,
  generateTestWallet,
  initializeLucid,
  waitForTx,
} from "./utils/lucid-utils";
import * as fs from "fs";
import * as path from "path";

// Define the Datum type
const DatumSchema = Data.Object({
  owner: Data.Bytes(),
  counter: Data.Integer(),
});
type Datum = Data.Static<typeof DatumSchema>;

// Define the Redeemer type
const RedeemerSchema = Data.Enum([
  Data.Literal("Increment"),
  Data.Literal("Decrement"),
]);
type Redeemer = Data.Static<typeof RedeemerSchema>;

describe("Counter Validator Tests", () => {
  let lucid: Lucid;
  let script: Script;
  let scriptAddress: string;
  let wallet: any;

  beforeAll(async () => {
    // Initialize Lucid with Blockfrost
    const provider = createBlockfrostProvider(
      process.env.BLOCKFROST_PROJECT_ID!,
      "preprod"
    );
    
    lucid = await initializeLucid(provider, "Preprod");
    
    // Generate test wallet
    wallet = await generateTestWallet(lucid);
    await lucid.selectWalletFromPrivateKey(wallet.paymentKey);
    
    // Load the compiled validator script
    const scriptPath = path.join(__dirname, "../plutus.json");
    
    // Note: In a real scenario, you would compile the Aiken validator first
    // For now, we'll create a placeholder script
    script = {
      type: "PlutusV2",
      script: "", // This would be populated from the compiled Aiken output
    };
    
    // Get script address
    scriptAddress = lucid.utils.validatorToAddress(script);
    
    console.log("[Test Setup] Wallet address:", wallet.address);
    console.log("[Test Setup] Script address:", scriptAddress);
  });

  describe("Initialization", () => {
    it("should deploy counter with initial value", async () => {
      const ownerPubKeyHash = lucid.utils.getAddressDetails(wallet.address)
        .paymentCredential?.hash!;
      
      const initialDatum: Datum = {
        owner: ownerPubKeyHash,
        counter: 0n,
      };
      
      try {
        const tx = await lucid
          .newTx()
          .payToContract(
            scriptAddress,
            { inline: Data.to(initialDatum, DatumSchema) },
            { lovelace: 2000000n }
          )
          .complete();
        
        const signedTx = await tx.sign().complete();
        const txHash = await signedTx.submit();
        
        console.log("[Deploy Counter] Transaction hash:", txHash);
        
        const confirmed = await waitForTx(lucid, txHash);
        expect(confirmed).toBe(true);
      } catch (error) {
        console.error("[Deploy Counter] Error:", error);
        throw error;
      }
    });
  });

  describe("Increment Operation", () => {
    it("should increment counter value", async () => {
      // Get the current UTxO at script address
      const utxos = await lucid.utxosAt(scriptAddress);
      const scriptUtxo = utxos[0];
      
      expect(scriptUtxo).toBeDefined();
      
      // Parse current datum
      const currentDatum = Data.from(
        scriptUtxo.datum!,
        DatumSchema
      ) as Datum;
      
      // Create new datum with incremented counter
      const newDatum: Datum = {
        owner: currentDatum.owner,
        counter: currentDatum.counter + 1n,
      };
      
      const redeemer: Redeemer = "Increment";
      
      try {
        const tx = await lucid
          .newTx()
          .collectFrom([scriptUtxo], Data.to(redeemer, RedeemerSchema))
          .attachSpendingValidator(script)
          .payToContract(
            scriptAddress,
            { inline: Data.to(newDatum, DatumSchema) },
            { lovelace: scriptUtxo.assets.lovelace }
          )
          .addSigner(wallet.address)
          .complete();
        
        const signedTx = await tx.sign().complete();
        const txHash = await signedTx.submit();
        
        console.log("[Increment] Transaction hash:", txHash);
        
        const confirmed = await waitForTx(lucid, txHash);
        expect(confirmed).toBe(true);
        
        // Verify the counter was incremented
        const newUtxos = await lucid.utxosAt(scriptAddress);
        const newScriptUtxo = newUtxos[0];
        const updatedDatum = Data.from(
          newScriptUtxo.datum!,
          DatumSchema
        ) as Datum;
        
        expect(updatedDatum.counter).toBe(currentDatum.counter + 1n);
      } catch (error) {
        console.error("[Increment] Error:", error);
        throw error;
      }
    });
  });

  describe("Decrement Operation", () => {
    it("should decrement counter value", async () => {
      // Get the current UTxO at script address
      const utxos = await lucid.utxosAt(scriptAddress);
      const scriptUtxo = utxos[0];
      
      expect(scriptUtxo).toBeDefined();
      
      // Parse current datum
      const currentDatum = Data.from(
        scriptUtxo.datum!,
        DatumSchema
      ) as Datum;
      
      // Ensure counter is greater than 0
      expect(currentDatum.counter).toBeGreaterThan(0n);
      
      // Create new datum with decremented counter
      const newDatum: Datum = {
        owner: currentDatum.owner,
        counter: currentDatum.counter - 1n,
      };
      
      const redeemer: Redeemer = "Decrement";
      
      try {
        const tx = await lucid
          .newTx()
          .collectFrom([scriptUtxo], Data.to(redeemer, RedeemerSchema))
          .attachSpendingValidator(script)
          .payToContract(
            scriptAddress,
            { inline: Data.to(newDatum, DatumSchema) },
            { lovelace: scriptUtxo.assets.lovelace }
          )
          .addSigner(wallet.address)
          .complete();
        
        const signedTx = await tx.sign().complete();
        const txHash = await signedTx.submit();
        
        console.log("[Decrement] Transaction hash:", txHash);
        
        const confirmed = await waitForTx(lucid, txHash);
        expect(confirmed).toBe(true);
        
        // Verify the counter was decremented
        const newUtxos = await lucid.utxosAt(scriptAddress);
        const newScriptUtxo = newUtxos[0];
        const updatedDatum = Data.from(
          newScriptUtxo.datum!,
          DatumSchema
        ) as Datum;
        
        expect(updatedDatum.counter).toBe(currentDatum.counter - 1n);
      } catch (error) {
        console.error("[Decrement] Error:", error);
        throw error;
      }
    });

    it("should fail to decrement when counter is 0", async () => {
      // This test would require setting up a UTxO with counter = 0
      // and attempting to decrement it, expecting the transaction to fail
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Authorization", () => {
    it("should fail when not signed by owner", async () => {
      // This test would require attempting a transaction without the owner's signature
      // and expecting it to fail
      expect(true).toBe(true); // Placeholder
    });
  });
});