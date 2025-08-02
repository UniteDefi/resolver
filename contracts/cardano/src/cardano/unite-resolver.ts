import {
  Lucid,
  UTxO,
  TxHash,
  Address,
  Data
} from "lucid-cardano";
import {
  ResolverData,
  ResolverRedeemer
} from "../types/cardano";
import { ResolverDatumSchema } from "./utils";

export class UniteResolver {
  private lucid: Lucid;
  private resolverScript: string;
  private resolverAddress: Address;

  constructor(lucid: Lucid, resolverScript: string) {
    this.lucid = lucid;
    this.resolverScript = resolverScript;
    this.resolverAddress = lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: resolverScript
    });
  }

  // Initialize resolver
  async initialize(resolver: string): Promise<TxHash> {
    const resolverData: ResolverData = {
      resolver,
      totalCommitted: BigInt(0),
      totalEarned: BigInt(0),
      activeOrders: []
    };

    const datum = Data.to(resolverData, ResolverDatumSchema);
    
    const tx = await this.lucid
      .newTx()
      .payToContract(
        this.resolverAddress,
        { inline: datum },
        { lovelace: BigInt(2000000) } // 2 ADA minimum
      )
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Commit to order
  async commitToOrder(
    resolverUtxo: UTxO,
    orderHash: string,
    partialAmount: bigint,
    safetyDeposit: bigint
  ): Promise<TxHash> {
    const existingDatum = Data.from(resolverUtxo.datum!, ResolverDatumSchema) as ResolverData;
    
    const redeemer: ResolverRedeemer = {
      type: "CommitToOrder",
      orderHash,
      partialAmount,
      safetyDeposit
    };

    const redeemerData = Data.to(redeemer);
    
    // Update resolver state
    const updatedDatum: ResolverData = {
      resolver: existingDatum.resolver,
      totalCommitted: existingDatum.totalCommitted + partialAmount,
      totalEarned: existingDatum.totalEarned,
      activeOrders: [...existingDatum.activeOrders, orderHash]
    };

    const newDatum = Data.to(updatedDatum, ResolverDatumSchema);

    // Add safety deposit to the resolver UTxO
    const updatedAssets = { ...resolverUtxo.assets };
    updatedAssets.lovelace = (updatedAssets.lovelace || BigInt(0)) + safetyDeposit;

    const tx = await this.lucid
      .newTx()
      .collectFrom([resolverUtxo], redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.resolverScript
      })
      .payToContract(this.resolverAddress, { inline: newDatum }, updatedAssets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Withdraw earnings
  async withdrawEarnings(
    resolverUtxo: UTxO,
    withdrawalAddress: Address
  ): Promise<TxHash> {
    const existingDatum = Data.from(resolverUtxo.datum!, ResolverDatumSchema) as ResolverData;
    
    const redeemer: ResolverRedeemer = {
      type: "WithdrawEarnings"
    };

    const redeemerData = Data.to(redeemer);
    
    // Reset earnings to 0
    const updatedDatum: ResolverData = {
      ...existingDatum,
      totalEarned: BigInt(0)
    };

    const newDatum = Data.to(updatedDatum, ResolverDatumSchema);

    // Calculate withdrawal amount (earnings)
    const earningsToWithdraw = existingDatum.totalEarned;
    const remainingAssets = { ...resolverUtxo.assets };
    remainingAssets.lovelace = (remainingAssets.lovelace || BigInt(0)) - earningsToWithdraw;

    const tx = await this.lucid
      .newTx()
      .collectFrom([resolverUtxo], redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.resolverScript
      })
      .payToContract(this.resolverAddress, { inline: newDatum }, remainingAssets)
      .payToAddress(withdrawalAddress, { lovelace: earningsToWithdraw })
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Update commitment
  async updateCommitment(
    resolverUtxo: UTxO,
    orderHash: string,
    newAmount: bigint
  ): Promise<TxHash> {
    const existingDatum = Data.from(resolverUtxo.datum!, ResolverDatumSchema) as ResolverData;
    
    const redeemer: ResolverRedeemer = {
      type: "UpdateCommitment",
      orderHash,
      newAmount
    };

    const redeemerData = Data.to(redeemer);
    
    // Update commitment (simplified - in practice you'd track per-order amounts)
    const updatedDatum: ResolverData = {
      ...existingDatum,
      totalCommitted: newAmount
    };

    const newDatum = Data.to(updatedDatum, ResolverDatumSchema);

    const tx = await this.lucid
      .newTx()
      .collectFrom([resolverUtxo], redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.resolverScript
      })
      .payToContract(this.resolverAddress, { inline: newDatum }, resolverUtxo.assets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Get resolver state
  async getResolverState(resolver: string): Promise<ResolverData | null> {
    const utxos = await this.lucid.utxosAt(this.resolverAddress);
    
    for (const utxo of utxos) {
      if (!utxo.datum) continue;
      
      try {
        const data = Data.from(utxo.datum, ResolverDatumSchema) as ResolverData;
        if (data.resolver === resolver) {
          return data;
        }
      } catch {
        continue;
      }
    }
    
    return null;
  }

  // Get resolver UTxO
  async getResolverUtxo(resolver: string): Promise<UTxO | null> {
    const utxos = await this.lucid.utxosAt(this.resolverAddress);
    
    for (const utxo of utxos) {
      if (!utxo.datum) continue;
      
      try {
        const data = Data.from(utxo.datum, ResolverDatumSchema) as ResolverData;
        if (data.resolver === resolver) {
          return utxo;
        }
      } catch {
        continue;
      }
    }
    
    return null;
  }

  getResolverAddress(): Address {
    return this.resolverAddress;
  }
}
