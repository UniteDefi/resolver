import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
  U64,
  MoveVector,
} from "@aptos-labs/ts-sdk";
import * as dotenv from "dotenv";

dotenv.config();

export interface AptosTestConfig {
  aptos: Aptos;
  admin: Account;
  user: Account;
  resolvers: Account[];
  packageAddress: string;
  network: Network;
}

export interface Immutables {
  order_hash: number[];
  hashlock: number[];
  maker: string;
  taker: string;
  token: string;
  amount: U64;
  safety_deposit: U64;
  timelocks: U64;
}

export async function setupAptosTest(): Promise<AptosTestConfig> {
  const network = (process.env.APTOS_NETWORK?.toLowerCase() as Network) || Network.DEVNET;
  const config = new AptosConfig({ network });
  const aptos = new Aptos(config);

  // Setup admin account
  let admin: Account;
  const privateKey = process.env.APTOS_PRIVATE_KEY;
  if (privateKey) {
    admin = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey),
    });
  } else {
    admin = Account.generate();
    await aptos.fundAccount({
      accountAddress: admin.accountAddress,
      amount: 100_000_000,
    });
  }

  // Setup test accounts
  const user = Account.generate();
  const resolvers = [
    Account.generate(),
    Account.generate(),
    Account.generate(),
  ];

  // Fund all accounts
  const fundingPromises = [user, ...resolvers].map(account =>
    aptos.fundAccount({
      accountAddress: account.accountAddress,
      amount: 50_000_000,
    })
  );

  await Promise.all(fundingPromises);

  return {
    aptos,
    admin,
    user,
    resolvers,
    packageAddress: admin.accountAddress.toString(),
    network,
  };
}

export async function registerForCoin(
  aptos: Aptos,
  account: Account,
  packageAddress: string,
  coinType: 'usdt' | 'dai'
): Promise<void> {
  try {
    const registerTxn = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${packageAddress}::test_coin::register_${coinType}`,
        functionArguments: [],
      },
    });

    await aptos.signAndSubmitTransaction({
      signer: account,
      transaction: registerTxn,
    }).then(result => aptos.waitForTransaction({
      transactionHash: result.hash,
    }));
  } catch (error: any) {
    if (!error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
      throw error;
    }
  }
}

export async function mintTestCoin(
  aptos: Aptos,
  admin: Account,
  recipient: string,
  amount: string,
  packageAddress: string,
  coinType: 'usdt' | 'dai'
): Promise<void> {
  const mintTxn = await aptos.transaction.build.simple({
    sender: admin.accountAddress,
    data: {
      function: `${packageAddress}::test_coin::mint_${coinType}`,
      functionArguments: [
        recipient,
        amount,
        packageAddress,
      ],
    },
  });

  await aptos.signAndSubmitTransaction({
    signer: admin,
    transaction: mintTxn,
  }).then(result => aptos.waitForTransaction({
    transactionHash: result.hash,
  }));
}

export async function getCoinBalance(
  aptos: Aptos,
  address: string,
  packageAddress: string,
  coinType: 'usdt' | 'dai'
): Promise<string> {
  const balance = await aptos.view({
    payload: {
      function: `${packageAddress}::test_coin::get_${coinType}_balance`,
      functionArguments: [address],
    },
  });
  return balance[0] as string;
}

export async function initializeProtocols(
  aptos: Aptos,
  admin: Account,
  packageAddress: string
): Promise<void> {
  const protocols = [
    'test_coin::initialize_usdt',
    'test_coin::initialize_dai',
    'limit_order_protocol::initialize',
    'escrow_factory::initialize',
  ];

  for (const protocol of protocols) {
    try {
      const initTxn = await aptos.transaction.build.simple({
        sender: admin.accountAddress,
        data: {
          function: `${packageAddress}::${protocol}`,
          functionArguments: [],
        },
      });

      await aptos.signAndSubmitTransaction({
        signer: admin,
        transaction: initTxn,
      }).then(result => aptos.waitForTransaction({
        transactionHash: result.hash,
      }));
    } catch (error: any) {
      if (!error.message?.includes("ERESOURCE_ALREADY_EXISTS")) {
        console.warn(`Failed to initialize ${protocol}:`, error.message);
      }
    }
  }
}

export async function createEscrow<CoinType extends string>(
  aptos: Aptos,
  resolver: Account,
  immutables: Immutables,
  partialAmount: string,
  safetyDeposit: string,
  packageAddress: string,
  coinType: CoinType,
  isSource: boolean,
  srcCancellationTimestamp?: string
): Promise<string> {
  const functionName = isSource ? 'create_src_escrow_partial' : 'create_dst_escrow_partial';
  
  const args = isSource ? [
    immutables,
    partialAmount,
    safetyDeposit,
  ] : [
    immutables,
    srcCancellationTimestamp || "0",
    partialAmount,
    safetyDeposit,
  ];

  const createTxn = await aptos.transaction.build.simple({
    sender: resolver.accountAddress,
    data: {
      function: `${packageAddress}::escrow_factory::${functionName}`,
      typeArguments: [`${packageAddress}::test_coin::Test${coinType.toUpperCase()}`],
      functionArguments: args,
    },
  });

  const result = await aptos.signAndSubmitTransaction({
    signer: resolver,
    transaction: createTxn,
  });

  await aptos.waitForTransaction({
    transactionHash: result.hash,
  });

  // Return escrow address (would need to be extracted from events in real implementation)
  return resolver.accountAddress.toString();
}

export function encodeTimelocks(timelocks: {
  srcWithdrawal: number;
  srcPublicWithdrawal: number;
  srcCancellation: number;
  srcPublicCancellation: number;
  dstWithdrawal: number;
  dstPublicWithdrawal: number;
  dstCancellation: number;
}): string {
  let encoded = 0n;
  encoded |= BigInt(timelocks.srcWithdrawal & 0xFFFFFFFF);
  encoded |= BigInt(timelocks.srcPublicWithdrawal & 0xFFFFFFFF) << 32n;
  encoded |= BigInt(timelocks.srcCancellation & 0xFFFFFFFF) << 64n;
  encoded |= BigInt(timelocks.srcPublicCancellation & 0xFFFFFFFF) << 96n;
  encoded |= BigInt(timelocks.dstWithdrawal & 0xFFFFFFFF) << 128n;
  encoded |= BigInt(timelocks.dstPublicWithdrawal & 0xFFFFFFFF) << 160n;
  encoded |= BigInt(timelocks.dstCancellation & 0xFFFFFFFF) << 192n;
  return encoded.toString();
}

export function createTestImmutables(
  orderHash: number[],
  hashlock: number[],
  maker: string,
  taker: string,
  token: string,
  amount: string,
  safetyDeposit: string,
  timelocks: string
): Immutables {
  return {
    order_hash: orderHash,
    hashlock: hashlock,
    maker,
    taker,
    token,
    amount: new U64(amount),
    safety_deposit: new U64(safetyDeposit),
    timelocks: new U64(timelocks),
  };
}

export async function waitForTransaction(
  aptos: Aptos,
  txnHash: string,
  timeoutSecs: number = 30
): Promise<any> {
  return aptos.waitForTransaction({
    transactionHash: txnHash,
    options: {
      timeoutSecs,
    },
  });
}

export function formatAmount(amount: string, decimals: number): string {
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const wholePart = num / divisor;
  const fractionalPart = num % divisor;
  
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${wholePart}.${fractionalStr}`.replace(/\.?0+$/, '');
}

export function parseAmount(amount: string, decimals: number): string {
  const [wholePart, fractionalPart = ''] = amount.split('.');
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  return (BigInt(wholePart) * BigInt(10 ** decimals) + BigInt(paddedFractional)).toString();
}