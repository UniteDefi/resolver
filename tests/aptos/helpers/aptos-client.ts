import { AptosClient, TxnBuilderTypes, BCS } from "aptos";
import { APTOS_CONFIG } from "../config";

export class UniteDefiAptosClient {
  private client: AptosClient;
  private moduleAddress: string;

  constructor(moduleAddress: string = APTOS_CONFIG.moduleAddress) {
    this.client = new AptosClient(APTOS_CONFIG.nodeUrl);
    this.moduleAddress = moduleAddress;
  }

  // Dutch Auction Functions
  async createAuction(
    wallet: any,
    tokenType: string,
    tokenAmount: bigint,
    startPrice: bigint,
    endPrice: bigint,
    duration: bigint,
    hashSecret: string
  ): Promise<string> {
    const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
      type: "entry_function_payload",
      function: `${this.moduleAddress}::dutch_auction::create_auction`,
      type_arguments: [tokenType],
      arguments: [
        tokenAmount.toString(),
        startPrice.toString(),
        endPrice.toString(),
        duration.toString(),
        hashSecret,
      ],
    };

    return await wallet.submitTransaction(payload);
  }

  async getCurrentPrice(auctionId: bigint): Promise<bigint> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::dutch_auction::get_current_price`,
      type_arguments: [],
      arguments: [auctionId.toString()],
    });
    return BigInt(result[0] as string);
  }

  async settleAuction(
    wallet: any,
    tokenType: string,
    auctionId: bigint,
    paymentAmount: bigint
  ): Promise<string> {
    const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
      type: "entry_function_payload",
      function: `${this.moduleAddress}::dutch_auction::settle_auction`,
      type_arguments: [tokenType],
      arguments: [auctionId.toString()],
    };

    return await wallet.submitTransaction(payload);
  }

  // Escrow Factory Functions
  async initializeFactory(wallet: any): Promise<string> {
    const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
      type: "entry_function_payload",
      function: `${this.moduleAddress}::escrow_factory::initialize`,
      type_arguments: [],
      arguments: [],
    };

    return await wallet.submitTransaction(payload);
  }

  async approveTokens(
    wallet: any,
    tokenType: string,
    amount: bigint
  ): Promise<string> {
    const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
      type: "entry_function_payload",
      function: `${this.moduleAddress}::escrow_factory::approve_tokens`,
      type_arguments: [tokenType],
      arguments: [amount.toString()],
    };

    return await wallet.submitTransaction(payload);
  }

  async createEscrowForAuction(
    wallet: any,
    tokenType: string,
    auctionId: bigint,
    maker: string,
    taker: string,
    tokenAmount: bigint,
    hashlock: string,
    withdrawalDeadline: bigint,
    publicWithdrawalDeadline: bigint,
    cancellationDeadline: bigint,
    publicCancellationDeadline: bigint,
    isSource: boolean,
    safetyDeposit: bigint
  ): Promise<string> {
    const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
      type: "entry_function_payload",
      function: `${this.moduleAddress}::escrow_factory::create_escrow_for_auction`,
      type_arguments: [tokenType],
      arguments: [
        auctionId.toString(),
        maker,
        taker,
        tokenAmount.toString(),
        hashlock,
        withdrawalDeadline.toString(),
        publicWithdrawalDeadline.toString(),
        cancellationDeadline.toString(),
        publicCancellationDeadline.toString(),
        isSource,
      ],
    };

    return await wallet.submitTransaction(payload);
  }

  // HTLC Escrow Functions
  async withdrawFromEscrow(
    wallet: any,
    tokenType: string,
    escrowAddress: string,
    secret: string
  ): Promise<string> {
    const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
      type: "entry_function_payload",
      function: `${this.moduleAddress}::htlc_escrow::withdraw`,
      type_arguments: [tokenType],
      arguments: [escrowAddress, secret],
    };

    return await wallet.submitTransaction(payload);
  }

  async cancelEscrow(
    wallet: any,
    tokenType: string,
    escrowAddress: string
  ): Promise<string> {
    const payload: TxnBuilderTypes.TransactionPayloadEntryFunction = {
      type: "entry_function_payload",
      function: `${this.moduleAddress}::htlc_escrow::cancel`,
      type_arguments: [tokenType],
      arguments: [escrowAddress],
    };

    return await wallet.submitTransaction(payload);
  }

  // View Functions
  async getAuctionDetails(auctionId: bigint): Promise<any> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::dutch_auction::get_auction_details`,
      type_arguments: [],
      arguments: [auctionId.toString()],
    });
    return {
      seller: result[0],
      tokenAmount: BigInt(result[1] as string),
      startPrice: BigInt(result[2] as string),
      endPrice: BigInt(result[3] as string),
      startTime: BigInt(result[4] as string),
      duration: BigInt(result[5] as string),
      active: result[6],
      hashSecret: result[7],
    };
  }

  async getEscrowDetails(tokenType: string, escrowAddress: string): Promise<any> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::htlc_escrow::get_escrow_details`,
      type_arguments: [tokenType],
      arguments: [escrowAddress],
    });
    return {
      maker: result[0],
      taker: result[1],
      tokenAmount: BigInt(result[2] as string),
      hashlock: result[3],
      withdrawalDeadline: BigInt(result[4] as string),
      cancellationDeadline: BigInt(result[5] as string),
      isWithdrawn: result[6],
      isCancelled: result[7],
      revealedSecret: result[8],
    };
  }

  async getResolverLock(auctionId: bigint): Promise<any> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::escrow_factory::get_resolver_lock`,
      type_arguments: [],
      arguments: [auctionId.toString()],
    });
    return {
      resolver: result[0],
      escrowSrc: result[1],
      escrowDst: result[2],
    };
  }

  async isResolverLocked(auctionId: bigint): Promise<boolean> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::escrow_factory::is_resolver_locked`,
      type_arguments: [],
      arguments: [auctionId.toString()],
    });
    return result[0] as boolean;
  }

  // Event monitoring
  async getEvents(eventHandle: string, fieldName: string): Promise<any[]> {
    return await this.client.getEventsByEventHandle(
      this.moduleAddress,
      eventHandle,
      fieldName
    );
  }
}