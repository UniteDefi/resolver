import { AptosAccount, AptosClient, FaucetClient, TxnBuilderTypes, BCS } from "aptos";
import { APTOS_CONFIG } from "./config";

export class AptosWallet {
  private account: AptosAccount;
  private client: AptosClient;
  private faucetClient: FaucetClient;

  constructor(privateKey?: Uint8Array) {
    this.account = privateKey ? new AptosAccount(privateKey) : new AptosAccount();
    this.client = new AptosClient(APTOS_CONFIG.nodeUrl);
    this.faucetClient = new FaucetClient(APTOS_CONFIG.nodeUrl, APTOS_CONFIG.faucetUrl);
  }

  get address(): string {
    return this.account.address().hex();
  }

  get publicKey(): string {
    return this.account.pubKey().hex();
  }

  get privateKey(): string {
    return this.account.toPrivateKeyObject().privateKeyHex;
  }

  async fundAccount(amount: number = 100000000): Promise<void> {
    await this.faucetClient.fundAccount(this.account.address(), amount);
  }

  async getBalance(coinType: string = "0x1::aptos_coin::AptosCoin"): Promise<number> {
    try {
      const resource = await this.client.getAccountResource(
        this.account.address(),
        `0x1::coin::CoinStore<${coinType}>`
      );
      return parseInt((resource.data as any).coin.value);
    } catch (e) {
      return 0;
    }
  }

  async submitTransaction(payload: TxnBuilderTypes.TransactionPayload): Promise<string> {
    const rawTxn = await this.client.generateTransaction(
      this.account.address(),
      payload,
      {
        max_gas_amount: APTOS_CONFIG.maxGasAmount.toString(),
        gas_unit_price: APTOS_CONFIG.gasUnitPrice.toString(),
      }
    );

    const signedTxn = await this.client.signTransaction(this.account, rawTxn);
    const pendingTxn = await this.client.submitTransaction(signedTxn);
    await this.client.waitForTransaction(pendingTxn.hash);
    
    return pendingTxn.hash;
  }

  async callViewFunction(
    function_: string,
    type_arguments: string[] = [],
    arguments: any[] = []
  ): Promise<any> {
    return await this.client.view({
      function: function_,
      type_arguments,
      arguments,
    });
  }

  generateSecretAndHash(): { secret: string; hashlock: string } {
    const secret = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)));
    const hashlock = BCS.sha3_256(secret);
    
    return {
      secret: secret.toString("hex"),
      hashlock: Buffer.from(hashlock).toString("hex"),
    };
  }
}

export async function createTestWallets(count: number): Promise<AptosWallet[]> {
  const wallets: AptosWallet[] = [];
  
  for (let i = 0; i < count; i++) {
    const wallet = new AptosWallet();
    await wallet.fundAccount();
    wallets.push(wallet);
  }
  
  return wallets;
}