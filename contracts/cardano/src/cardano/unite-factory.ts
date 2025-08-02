import {
  Lucid,
  UTxO,
  TxHash,
  Address,
  Data
} from "lucid-cardano";
import {
  FactoryData,
  FactoryRedeemer,
  CreateEscrowParams
} from "../types/cardano";
import { FactoryDatumSchema } from "./utils";

export class UniteFactory {
  private lucid: Lucid;
  private factoryScript: string;
  private factoryAddress: Address;

  constructor(lucid: Lucid, factoryScript: string) {
    this.lucid = lucid;
    this.factoryScript = factoryScript;
    this.factoryAddress = lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: factoryScript
    });
  }

  // Initialize factory
  async initialize(admin: string): Promise<TxHash> {
    const factoryData: FactoryData = {
      escrowCount: 0,
      totalVolume: BigInt(0),
      admin
    };

    const datum = Data.to(factoryData, FactoryDatumSchema);
    
    const tx = await this.lucid
      .newTx()
      .payToContract(
        this.factoryAddress,
        { inline: datum },
        { lovelace: BigInt(2000000) } // 2 ADA minimum
      )
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Create new escrow through factory
  async createEscrow(
    factoryUtxo: UTxO,
    orderHash: string,
    isSource: boolean,
    initialResolver: string,
    partialAmount: bigint
  ): Promise<TxHash> {
    const existingDatum = Data.from(factoryUtxo.datum!, FactoryDatumSchema) as FactoryData;
    
    const redeemer: FactoryRedeemer = {
      type: "CreateEscrow",
      orderHash,
      isSource,
      initialResolver,
      partialAmount
    };

    const redeemerData = Data.to(redeemer);
    
    // Update factory state
    const updatedDatum: FactoryData = {
      escrowCount: existingDatum.escrowCount + 1,
      totalVolume: existingDatum.totalVolume + partialAmount,
      admin: existingDatum.admin
    };

    const newDatum = Data.to(updatedDatum, FactoryDatumSchema);

    const tx = await this.lucid
      .newTx()
      .collectFrom([factoryUtxo], redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.factoryScript
      })
      .payToContract(this.factoryAddress, { inline: newDatum }, factoryUtxo.assets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Update admin
  async updateAdmin(
    factoryUtxo: UTxO,
    newAdmin: string
  ): Promise<TxHash> {
    const existingDatum = Data.from(factoryUtxo.datum!, FactoryDatumSchema) as FactoryData;
    
    const redeemer: FactoryRedeemer = {
      type: "UpdateAdmin",
      newAdmin
    };

    const redeemerData = Data.to(redeemer);
    
    const updatedDatum: FactoryData = {
      ...existingDatum,
      admin: newAdmin
    };

    const newDatum = Data.to(updatedDatum, FactoryDatumSchema);

    const tx = await this.lucid
      .newTx()
      .collectFrom([factoryUtxo], redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.factoryScript
      })
      .payToContract(this.factoryAddress, { inline: newDatum }, factoryUtxo.assets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Get factory state
  async getFactoryState(): Promise<FactoryData | null> {
    const utxos = await this.lucid.utxosAt(this.factoryAddress);
    
    if (utxos.length === 0) return null;
    
    const factoryUtxo = utxos[0];
    if (!factoryUtxo.datum) return null;
    
    return Data.from(factoryUtxo.datum, FactoryDatumSchema) as FactoryData;
  }

  // Get factory UTxO
  async getFactoryUtxo(): Promise<UTxO | null> {
    const utxos = await this.lucid.utxosAt(this.factoryAddress);
    return utxos.length > 0 ? utxos[0] : null;
  }

  getFactoryAddress(): Address {
    return this.factoryAddress;
  }
}
