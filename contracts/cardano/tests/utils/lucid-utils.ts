import {
  Blockfrost,
  C,
  Data,
  Lucid,
  Maestro,
  Provider,
  TxHash,
  UTxO,
  fromHex,
  toHex,
} from "lucid-cardano";

export interface TestWallet {
  address: string;
  paymentKey: string;
  stakeKey?: string;
}

export const initializeLucid = async (
  provider: Provider,
  network: "Preprod" | "Mainnet" = "Preprod"
): Promise<Lucid> => {
  const lucid = await Lucid.new(provider, network);
  return lucid;
};

export const createBlockfrostProvider = (
  projectId: string,
  network: "preprod" | "mainnet" = "preprod"
): Provider => {
  const url = network === "preprod" 
    ? "https://cardano-preprod.blockfrost.io/api/v0"
    : "https://cardano-mainnet.blockfrost.io/api/v0";
  
  return new Blockfrost(url, projectId);
};

export const createMaestroProvider = (
  apiKey: string,
  network: "Preprod" | "Mainnet" = "Preprod"
): Provider => {
  return new Maestro({
    network,
    apiKey,
  });
};

export const generateTestWallet = async (
  lucid: Lucid
): Promise<TestWallet> => {
  const privateKey = lucid.utils.generatePrivateKey();
  const address = await lucid
    .selectWalletFromPrivateKey(privateKey)
    .wallet.address();

  return {
    address,
    paymentKey: privateKey,
  };
};

export const fundWallet = async (
  lucid: Lucid,
  address: string,
  lovelaceAmount: bigint
): Promise<TxHash> => {
  // This is a mock function for testing
  // In real tests, you would need to fund from a faucet or existing wallet
  console.log(`[Funding] Address: ${address} with ${lovelaceAmount} lovelace`);
  throw new Error("Wallet funding must be implemented for your test environment");
};

export const waitForTx = async (
  lucid: Lucid,
  txHash: TxHash,
  maxWaitTime: number = 60000
): Promise<boolean> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const isConfirmed = await lucid.awaitTx(txHash);
      if (isConfirmed) {
        return true;
      }
    } catch (error) {
      console.log(`[WaitForTx] Transaction not confirmed yet: ${txHash}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  return false;
};