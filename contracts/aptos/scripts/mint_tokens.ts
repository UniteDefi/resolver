import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import dotenv from "dotenv";

dotenv.config();

async function mintTokens(): Promise<void> {
  console.log("[Mint] Starting token minting process...");

  // Configuration
  const network = (process.env.APTOS_NETWORK as Network) || Network.TESTNET;
  const config = new AptosConfig({ network });
  const aptos = new Aptos(config);

  // Initialize accounts
  const deployer = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY!),
  });

  const user = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(process.env.APTOS_USER_PRIVATE_KEY!),
  });

  const resolvers = [
    Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_0!),
    }),
    Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_1!),
    }),
    Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_2!),
    }),
    Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(process.env.APTOS_RESOLVER_PRIVATE_KEY_3!),
    }),
  ];

  const packageAddress = process.env.APTOS_DEPLOYER_ADDRESS!;
  const recipients = [user, ...resolvers];
  const tokenAmount = 1000;

  console.log(`[Mint] Package address: ${packageAddress}`);
  console.log(`[Mint] Deployer: ${deployer.accountAddress.toString()}`);

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const recipientName = recipient === user ? "User" : `Resolver ${resolvers.indexOf(recipient)}`;

    try {
      console.log(`\n[Mint] Processing ${recipientName} (${recipient.accountAddress.toString()})...`);

      // Register for coins first
      try {
        const registerUSDTTxn = await aptos.transaction.build.simple({
          sender: recipient.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::register_usdt`,
            functionArguments: [],
          },
        });

        const registerUSDTResult = await aptos.signAndSubmitTransaction({
          signer: recipient,
          transaction: registerUSDTTxn,
        });

        await aptos.waitForTransaction({
          transactionHash: registerUSDTResult.hash,
        });

        console.log(`[Mint] ✅ ${recipientName} registered for TestUSDT`);
      } catch (error) {
        console.log(`[Mint] ${recipientName} already registered for TestUSDT or registration failed`);
      }

      try {
        const registerDAITxn = await aptos.transaction.build.simple({
          sender: recipient.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::register_dai`,
            functionArguments: [],
          },
        });

        const registerDAIResult = await aptos.signAndSubmitTransaction({
          signer: recipient,
          transaction: registerDAITxn,
        });

        await aptos.waitForTransaction({
          transactionHash: registerDAIResult.hash,
        });

        console.log(`[Mint] ✅ ${recipientName} registered for TestDAI`);
      } catch (error) {
        console.log(`[Mint] ${recipientName} already registered for TestDAI or registration failed`);
      }

      // Mint TestUSDT
      try {
        const mintUSDTTxn = await aptos.transaction.build.simple({
          sender: deployer.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::mint_usdt`,
            functionArguments: [recipient.accountAddress.toString(), tokenAmount * 1_000_000], // 6 decimals
          },
        });

        const usdtResult = await aptos.signAndSubmitTransaction({
          signer: deployer,
          transaction: mintUSDTTxn,
        });

        await aptos.waitForTransaction({
          transactionHash: usdtResult.hash,
        });

        console.log(`[Mint] ✅ Minted ${tokenAmount} TestUSDT to ${recipientName} - Tx: ${usdtResult.hash}`);
      } catch (error) {
        console.error(`[Mint] ❌ Failed to mint TestUSDT to ${recipientName}:`, error);
      }

      // Mint TestDAI
      try {
        const mintDAITxn = await aptos.transaction.build.simple({
          sender: deployer.accountAddress,
          data: {
            function: `${packageAddress}::test_coin::mint_dai`,
            functionArguments: [recipient.accountAddress.toString(), tokenAmount], // Simplified amount
          },
        });

        const daiResult = await aptos.signAndSubmitTransaction({
          signer: deployer,
          transaction: mintDAITxn,
        });

        await aptos.waitForTransaction({
          transactionHash: daiResult.hash,
        });

        console.log(`[Mint] ✅ Minted ${tokenAmount} TestDAI to ${recipientName} - Tx: ${daiResult.hash}`);
      } catch (error) {
        console.error(`[Mint] ❌ Failed to mint TestDAI to ${recipientName}:`, error);
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`[Mint] ❌ Failed to process ${recipientName}:`, error);
    }
  }

  console.log("\n[Mint] ✅ Token minting process completed!");
}

// Run if called directly
if (require.main === module) {
  mintTokens().catch(error => {
    console.error("[Mint] ❌ Token minting failed:", error);
    process.exit(1);
  });
}

export { mintTokens };