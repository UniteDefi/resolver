import { ethers } from "ethers";

export interface EscrowData {
  srcAddress: string;
  dstAddress: string;
  srcToken: string;
  srcAmount: bigint;
  dstChainId: number;
  dstToken: string;
  dstAmount: bigint;
  hashlock: string;
  timelock: number;
  state: number;
  secret: string;
}

export class EVMHelpers {
  constructor(
    private provider: ethers.Provider,
    private signer: ethers.Signer,
    private escrowFactoryAddress: string,
    private escrowFactoryABI: any[]
  ) {}

  async createEscrow(
    dstAddress: string,
    srcToken: string,
    srcAmount: bigint,
    dstChainId: number,
    dstToken: string,
    dstAmount: bigint,
    hashlock: string,
    timelock: number
  ): Promise<ethers.ContractTransactionReceipt> {
    const factory = new ethers.Contract(
      this.escrowFactoryAddress,
      this.escrowFactoryABI,
      this.signer
    );

    const tx = await factory.createEscrow(
      dstAddress,
      srcToken,
      srcAmount,
      dstChainId,
      dstToken,
      dstAmount,
      hashlock,
      timelock
    );

    return await tx.wait();
  }

  async withdrawEscrow(
    escrowAddress: string,
    secret: string,
    escrowABI: any[]
  ): Promise<ethers.ContractTransactionReceipt> {
    const escrow = new ethers.Contract(escrowAddress, escrowABI, this.signer);
    const tx = await escrow.withdraw(secret);
    return await tx.wait();
  }

  async refundEscrow(
    escrowAddress: string,
    escrowABI: any[]
  ): Promise<ethers.ContractTransactionReceipt> {
    const escrow = new ethers.Contract(escrowAddress, escrowABI, this.signer);
    const tx = await escrow.refund();
    return await tx.wait();
  }

  async getEscrowDetails(
    escrowAddress: string,
    escrowABI: any[]
  ): Promise<EscrowData> {
    const escrow = new ethers.Contract(
      escrowAddress,
      escrowABI,
      this.provider
    );

    const [
      srcAddress,
      dstAddress,
      srcToken,
      srcAmount,
      dstChainId,
      dstToken,
      dstAmount,
      hashlock,
      timelock,
      state,
      secret,
    ] = await Promise.all([
      escrow.srcAddress(),
      escrow.dstAddress(),
      escrow.srcToken(),
      escrow.srcAmount(),
      escrow.dstChainId(),
      escrow.dstToken(),
      escrow.dstAmount(),
      escrow.hashlock(),
      escrow.timelock(),
      escrow.state(),
      escrow.secret(),
    ]);

    return {
      srcAddress,
      dstAddress,
      srcToken,
      srcAmount,
      dstChainId,
      dstToken,
      dstAmount,
      hashlock,
      timelock,
      state,
      secret,
    };
  }

  generateHashlock(secret: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(secret));
  }

  async approveToken(
    tokenAddress: string,
    spender: string,
    amount: bigint,
    tokenABI: any[]
  ): Promise<ethers.ContractTransactionReceipt> {
    const token = new ethers.Contract(tokenAddress, tokenABI, this.signer);
    const tx = await token.approve(spender, amount);
    return await tx.wait();
  }

  async getTokenBalance(
    tokenAddress: string,
    account: string,
    tokenABI: any[]
  ): Promise<bigint> {
    const token = new ethers.Contract(tokenAddress, tokenABI, this.provider);
    return await token.balanceOf(account);
  }

  async waitForBlocks(blocks: number): Promise<void> {
    const startBlock = await this.provider.getBlockNumber();
    while ((await this.provider.getBlockNumber()) < startBlock + blocks) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async getCurrentTimestamp(): Promise<number> {
    const block = await this.provider.getBlock("latest");
    return block!.timestamp;
  }

  encodeOrderData(order: {
    maker: string;
    taker: string;
    makerAsset: string;
    takerAsset: string;
    makerAmount: bigint;
    takerAmount: bigint;
    salt: bigint;
    expiry: number;
  }): string {
    const abiCoder = new ethers.AbiCoder();
    return abiCoder.encode(
      [
        "address",
        "address",
        "address",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
      ],
      [
        order.maker,
        order.taker,
        order.makerAsset,
        order.takerAsset,
        order.makerAmount,
        order.takerAmount,
        order.salt,
        order.expiry,
      ]
    );
  }

  async signOrder(orderData: string): Promise<string> {
    return await this.signer.signMessage(ethers.getBytes(orderData));
  }

  verifyOrderSignature(
    orderData: string,
    signature: string,
    expectedSigner: string
  ): boolean {
    const recoveredAddress = ethers.verifyMessage(
      ethers.getBytes(orderData),
      signature
    );
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  }
}