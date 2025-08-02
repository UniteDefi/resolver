import { AptosClient, AptosAccount, Types } from "aptos";

export class AptosHelpers {
  constructor(
    private client: AptosClient,
    private moduleAddress: string
  ) {}

  async executeTransaction(
    account: AptosAccount,
    payload: Types.EntryFunctionPayload
  ): Promise<string> {
    const txnRequest = await this.client.generateTransaction(
      account.address(),
      payload
    );
    const signedTxn = await this.client.signTransaction(account, txnRequest);
    const res = await this.client.submitTransaction(signedTxn);
    await this.client.waitForTransaction(res.hash);
    return res.hash;
  }

  async getAccountBalance(
    address: string,
    coinType: string = "0x1::aptos_coin::AptosCoin"
  ): Promise<bigint> {
    const resources = await this.client.getAccountResources(address);
    const coinStore = resources.find(
      r => r.type === `0x1::coin::CoinStore<${coinType}>`
    );
    return BigInt(coinStore?.data.coin.value || 0);
  }

  async registerCoin(account: AptosAccount, coinType: string): Promise<void> {
    const payload = {
      function: "0x1::managed_coin::register",
      type_arguments: [coinType],
      arguments: [],
    };
    await this.executeTransaction(account, payload);
  }

  async transferCoin(
    sender: AptosAccount,
    recipient: string,
    amount: bigint,
    coinType: string = "0x1::aptos_coin::AptosCoin"
  ): Promise<string> {
    const payload = {
      function: "0x1::coin::transfer",
      type_arguments: [coinType],
      arguments: [recipient, amount.toString()],
    };
    return await this.executeTransaction(sender, payload);
  }

  generateHashlock(secret: Uint8Array): Uint8Array {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(secret).digest();
  }

  async createEscrow(
    creator: AptosAccount,
    dstAddress: string,
    amount: bigint,
    hashlock: Uint8Array,
    timelock: number,
    escrowId: Uint8Array,
    coinType: string = "0x1::aptos_coin::AptosCoin"
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::escrow::create_escrow`,
      type_arguments: [coinType],
      arguments: [
        dstAddress,
        amount.toString(),
        Array.from(hashlock),
        timelock.toString(),
        Array.from(escrowId),
      ],
    };
    return await this.executeTransaction(creator, payload);
  }

  async withdrawEscrow(
    withdrawer: AptosAccount,
    escrowHolder: string,
    secret: Uint8Array,
    coinType: string = "0x1::aptos_coin::AptosCoin"
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::escrow::withdraw`,
      type_arguments: [coinType],
      arguments: [
        escrowHolder,
        Array.from(secret),
      ],
    };
    return await this.executeTransaction(withdrawer, payload);
  }

  async refundEscrow(
    refunder: AptosAccount,
    escrowHolder: string,
    coinType: string = "0x1::aptos_coin::AptosCoin"
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::escrow::refund`,
      type_arguments: [coinType],
      arguments: [escrowHolder],
    };
    return await this.executeTransaction(refunder, payload);
  }

  async getEscrowDetails(
    escrowHolder: string,
    coinType: string = "0x1::aptos_coin::AptosCoin"
  ): Promise<{
    srcAddress: string;
    dstAddress: string;
    amount: bigint;
    hashlock: Uint8Array;
    timelock: number;
    state: number;
  }> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::escrow::get_escrow_details`,
      type_arguments: [coinType],
      arguments: [escrowHolder],
    });

    return {
      srcAddress: result[0] as string,
      dstAddress: result[1] as string,
      amount: BigInt(result[2] as string),
      hashlock: new Uint8Array(result[3] as number[]),
      timelock: Number(result[4]),
      state: Number(result[5]),
    };
  }

  async registerResolver(
    resolver: AptosAccount,
    name: string,
    feeBps: number
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::resolver::register_resolver`,
      type_arguments: [],
      arguments: [
        Array.from(Buffer.from(name, "utf8")),
        feeBps.toString(),
      ],
    };
    return await this.executeTransaction(resolver, payload);
  }

  async updateResolver(
    resolver: AptosAccount,
    feeBps: number,
    isActive: boolean
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::resolver::update_resolver`,
      type_arguments: [],
      arguments: [feeBps.toString(), isActive],
    };
    return await this.executeTransaction(resolver, payload);
  }

  async getResolverInfo(resolverAddress: string): Promise<{
    name: string;
    feeBps: number;
    isActive: boolean;
    totalResolved: number;
  }> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::resolver::get_resolver_info`,
      type_arguments: [],
      arguments: [resolverAddress],
    });

    return {
      name: Buffer.from(result[0] as number[]).toString("utf8"),
      feeBps: Number(result[1]),
      isActive: result[2] as boolean,
      totalResolved: Number(result[3]),
    };
  }

  async createOrder(
    maker: AptosAccount,
    taker: string,
    makerAsset: string,
    takerAsset: string,
    makerAmount: bigint,
    takerAmount: bigint,
    salt: bigint,
    expiry: number
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::limit_order_protocol::create_order`,
      type_arguments: [],
      arguments: [
        taker,
        makerAsset,
        takerAsset,
        makerAmount.toString(),
        takerAmount.toString(),
        salt.toString(),
        expiry.toString(),
      ],
    };
    return await this.executeTransaction(maker, payload);
  }

  async fillOrder(
    taker: AptosAccount,
    orderIndex: number
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::limit_order_protocol::fill_order`,
      type_arguments: [],
      arguments: [orderIndex.toString()],
    };
    return await this.executeTransaction(taker, payload);
  }

  async cancelOrder(
    maker: AptosAccount,
    orderIndex: number
  ): Promise<string> {
    const payload = {
      function: `${this.moduleAddress}::limit_order_protocol::cancel_order`,
      type_arguments: [],
      arguments: [orderIndex.toString()],
    };
    return await this.executeTransaction(maker, payload);
  }

  async getOrderDetails(orderIndex: number): Promise<{
    maker: string;
    taker: string;
    makerAsset: string;
    takerAsset: string;
    makerAmount: bigint;
    takerAmount: bigint;
    isFilled: boolean;
    isCancelled: boolean;
  }> {
    const result = await this.client.view({
      function: `${this.moduleAddress}::limit_order_protocol::get_order`,
      type_arguments: [],
      arguments: [orderIndex.toString()],
    });

    return {
      maker: result[0] as string,
      taker: result[1] as string,
      makerAsset: result[2] as string,
      takerAsset: result[3] as string,
      makerAmount: BigInt(result[4] as string),
      takerAmount: BigInt(result[5] as string),
      isFilled: result[6] as boolean,
      isCancelled: result[7] as boolean,
    };
  }
}