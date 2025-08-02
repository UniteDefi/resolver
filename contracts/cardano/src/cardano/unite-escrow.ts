import {
  Lucid,
  UTxO,
  TxHash,
  Address,
  Assets,
  Data,
  Credential,
  getAddressDetails,
  scriptFromNative
} from "lucid-cardano";
import {
  EscrowData,
  EscrowRedeemer,
  CreateEscrowParams,
  EscrowTxParams,
  CrossChainOrder,
  EscrowState
} from "../types/cardano";
import {
  encodeEscrowDatum,
  decodeEscrowDatum,
  encodeEscrowRedeemer,
  generateSecret,
  generateHashlock,
  calculateSafetyDeposit,
  getCurrentTimeSeconds,
  createAssets,
  getAssetAmount
} from "./utils";

export class UniteEscrow {
  private lucid: Lucid;
  private escrowScript: string;
  private escrowAddress: Address;

  constructor(lucid: Lucid, escrowScript: string) {
    this.lucid = lucid;
    this.escrowScript = escrowScript;
    this.escrowAddress = lucid.utils.validatorToAddress({
      type: "PlutusV2",
      script: escrowScript
    });
  }

  // Create a new escrow for source chain
  async createSourceEscrow(params: CreateEscrowParams): Promise<TxHash> {
    const { order, resolver, partialAmount, safetyDeposit } = params;
    
    const secret = params.secret || generateSecret();
    const hashlock = params.hashlock || generateHashlock(secret);
    
    const currentTime = getCurrentTimeSeconds();
    
    const escrowData: EscrowData = {
      orderHash: order.orderHash,
      hashlock,
      maker: order.maker,
      taker: "", // Will be set when taker is known
      resolver,
      tokenPolicy: "", // ADA for now
      tokenName: "",
      amount: order.amount,
      partialAmount,
      safetyDeposit,
      srcCancellationTimestamp: 0, // Not applicable for source
      timelockStart: currentTime,
      timelockDuration: 3600, // 1 hour
      isSource: true,
      state: EscrowState.Active
    };

    const datum = encodeEscrowDatum(escrowData);
    
    // Create transaction with user funds + safety deposit
    const assets = createAssets("", "", partialAmount + safetyDeposit);
    
    const tx = await this.lucid
      .newTx()
      .payToContract(this.escrowAddress, { inline: datum }, assets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Create a new escrow for destination chain
  async createDestinationEscrow(
    params: CreateEscrowParams,
    srcCancellationTimestamp: number
  ): Promise<TxHash> {
    const { order, resolver, partialAmount, safetyDeposit } = params;
    
    const secret = params.secret || generateSecret();
    const hashlock = params.hashlock || generateHashlock(secret);
    
    const currentTime = getCurrentTimeSeconds();
    
    const escrowData: EscrowData = {
      orderHash: order.orderHash,
      hashlock,
      maker: order.maker,
      taker: "",
      resolver,
      tokenPolicy: "", // ADA for now
      tokenName: "",
      amount: order.expectedAmount,
      partialAmount,
      safetyDeposit,
      srcCancellationTimestamp,
      timelockStart: currentTime,
      timelockDuration: 3600, // 1 hour
      isSource: false,
      state: EscrowState.Active
    };

    const datum = encodeEscrowDatum(escrowData);
    
    // On destination, we start with just safety deposit
    // Tokens will be added separately by resolvers
    const assets = createAssets("", "", safetyDeposit);
    
    const tx = await this.lucid
      .newTx()
      .payToContract(this.escrowAddress, { inline: datum }, assets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Add a resolver to an existing escrow
  async addResolver(
    escrowUtxo: UTxO,
    resolver: string,
    partialAmount: bigint,
    safetyDeposit: bigint
  ): Promise<TxHash> {
    const existingDatum = decodeEscrowDatum(escrowUtxo.datum!);
    
    const redeemer: EscrowRedeemer = {
      type: "AddResolver",
      resolver,
      partialAmount
    };

    const redeemerData = encodeEscrowRedeemer(redeemer);
    
    // Update escrow datum with new resolver info
    const updatedDatum: EscrowData = {
      ...existingDatum,
      // In a real implementation, you'd track multiple resolvers
    };

    const newDatum = encodeEscrowDatum(updatedDatum);
    const existingAssets = escrowUtxo.assets;
    const additionalAssets = createAssets("", "", safetyDeposit);
    
    // Merge assets
    const totalAssets: Assets = { ...existingAssets };
    Object.keys(additionalAssets).forEach(key => {
      totalAssets[key] = (totalAssets[key] || BigInt(0)) + additionalAssets[key];
    });

    const tx = await this.lucid
      .newTx()
      .collectFrom([escrowUtxo], redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.escrowScript
      })
      .payToContract(this.escrowAddress, { inline: newDatum }, totalAssets)
      .complete();

    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Withdraw with secret (permissionless)
  async withdrawWithSecret(
    escrowUtxos: UTxO[],
    secret: string
  ): Promise<TxHash> {
    const redeemer: EscrowRedeemer = {
      type: "WithdrawWithSecret",
      secret
    };

    const redeemerData = encodeEscrowRedeemer(redeemer);
    
    let txBuilder = this.lucid.newTx()
      .collectFrom(escrowUtxos, redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.escrowScript
      });

    // For each escrow, determine withdrawal logic based on whether it's source or destination
    for (const utxo of escrowUtxos) {
      const datum = decodeEscrowDatum(utxo.datum!);
      
      if (datum.isSource) {
        // Source chain: distribute tokens to resolvers
        const resolverAssets = createAssets(
          datum.tokenPolicy,
          datum.tokenName,
          datum.partialAmount
        );
        
        txBuilder = txBuilder.payToAddress(datum.resolver, resolverAssets);
        
        // Return safety deposit
        const safetyDepositAssets = createAssets("", "", datum.safetyDeposit);
        txBuilder = txBuilder.payToAddress(datum.resolver, safetyDepositAssets);
      } else {
        // Destination chain: send tokens to user
        const userAssets = createAssets(
          datum.tokenPolicy,
          datum.tokenName,
          datum.partialAmount
        );
        
        txBuilder = txBuilder.payToAddress(datum.maker, userAssets);
        
        // Return safety deposit to resolver
        const safetyDepositAssets = createAssets("", "", datum.safetyDeposit);
        txBuilder = txBuilder.payToAddress(datum.resolver, safetyDepositAssets);
      }
    }

    const tx = await txBuilder.complete();
    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Cancel escrow
  async cancel(escrowUtxos: UTxO[]): Promise<TxHash> {
    const redeemer: EscrowRedeemer = {
      type: "Cancel"
    };

    const redeemerData = encodeEscrowRedeemer(redeemer);
    
    let txBuilder = this.lucid.newTx()
      .collectFrom(escrowUtxos, redeemerData)
      .attachSpendingValidator({
        type: "PlutusV2",
        script: this.escrowScript
      });

    // Return funds to maker and safety deposits to resolvers
    for (const utxo of escrowUtxos) {
      const datum = decodeEscrowDatum(utxo.datum!);
      
      // Return tokens to maker
      const tokenAssets = createAssets(
        datum.tokenPolicy,
        datum.tokenName,
        datum.partialAmount
      );
      txBuilder = txBuilder.payToAddress(datum.maker, tokenAssets);
      
      // Return safety deposit to resolver
      const safetyDepositAssets = createAssets("", "", datum.safetyDeposit);
      txBuilder = txBuilder.payToAddress(datum.resolver, safetyDepositAssets);
    }

    const tx = await txBuilder.complete();
    const signedTx = await tx.sign().complete();
    return await signedTx.submit();
  }

  // Get all escrows for an order
  async getEscrowsForOrder(orderHash: string): Promise<UTxO[]> {
    const utxos = await this.lucid.utxosAt(this.escrowAddress);
    
    return utxos.filter(utxo => {
      if (!utxo.datum) return false;
      
      try {
        const datum = decodeEscrowDatum(utxo.datum);
        return datum.orderHash === orderHash;
      } catch {
        return false;
      }
    });
  }

  // Get escrows by state
  async getEscrowsByState(state: EscrowState): Promise<UTxO[]> {
    const utxos = await this.lucid.utxosAt(this.escrowAddress);
    
    return utxos.filter(utxo => {
      if (!utxo.datum) return false;
      
      try {
        const datum = decodeEscrowDatum(utxo.datum);
        return datum.state === state;
      } catch {
        return false;
      }
    });
  }

  // Get total committed amount for an order
  async getTotalCommittedForOrder(orderHash: string): Promise<bigint> {
    const escrows = await this.getEscrowsForOrder(orderHash);
    
    return escrows.reduce((total, utxo) => {
      const datum = decodeEscrowDatum(utxo.datum!);
      return total + datum.partialAmount;
    }, BigInt(0));
  }

  // Helper to get escrow address
  getEscrowAddress(): Address {
    return this.escrowAddress;
  }
}
