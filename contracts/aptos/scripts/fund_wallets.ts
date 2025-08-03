import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface FundingConfig {
  aptAmount: number; // APT amount to fund (in APT, not octas)
  mintTokens: boolean; // Whether to also mint test tokens
  tokenAmount: number; // Amount of tokens to mint (USDT/DAI)
}

async function fundWallets(config: FundingConfig = { aptAmount: 0.5, mintTokens: true, tokenAmount: 1000 }) {
  console.log("[FundWallets] Starting wallet funding process...");

  // Configuration
  const network = (process.env.APTOS_NETWORK as Network) || Network.TESTNET;
  const aptosConfig = new AptosConfig({ network });
  const aptos = new Aptos(aptosConfig);

  // Load deployment info
  const deploymentsPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const deployment = deployments.aptos[network];
  
  if (!deployment) {
    throw new Error(`No deployment found for network: ${network}`);
  }

  const packageAddress = deployment.packageAddress;

  // Setup deployer account
  const privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("APTOS_PRIVATE_KEY not found in environment variables");
  }

  const deployer = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(privateKey),
  });

  console.log("[FundWallets] Deployer address:", deployer.accountAddress.toString());

  // Get all accounts to fund
  const accountsToFund: { name: string; account: Account }[] = [];
  
  // Add user account if available
  const userPrivateKey = process.env.APTOS_USER_PRIVATE_KEY;
  if (userPrivateKey) {
    accountsToFund.push({
      name: "User",
      account: Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(userPrivateKey),
      }),
    });
  }

  // Add resolver accounts
  for (let i = 0; i < 4; i++) {
    const resolverKey = process.env[`APTOS_RESOLVER_PRIVATE_KEY_${i}`];
    if (resolverKey) {
      accountsToFund.push({
        name: `Resolver ${i}`,
        account: Account.fromPrivateKey({
          privateKey: new Ed25519PrivateKey(resolverKey),
        }),
      });
    }
  }

  if (accountsToFund.length === 0) {
    console.log("[FundWallets] No accounts to fund. Set APTOS_USER_PRIVATE_KEY and/or APTOS_RESOLVER_PRIVATE_KEY_* in .env");
    return;
  }

  console.log(`[FundWallets] Found ${accountsToFund.length} accounts to fund`);
  console.log("[FundWallets] APT amount per wallet:", config.aptAmount, "APT");
  if (config.mintTokens) {
    console.log("[FundWallets] Token amount per wallet:", config.tokenAmount, "USDT/DAI");
  }

  // Check deployer balance
  let deployerBalance = 0;
  try {
    const balance = await aptos.view({
      payload: {
        function: "0x1::coin::balance",
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [deployer.accountAddress.toString()],
      },
    });
    deployerBalance = parseInt(balance[0] as string);
    console.log("[FundWallets] Deployer balance:", deployerBalance / 1e8, "APT");
  } catch (error) {
    console.error("[FundWallets] Failed to check deployer balance");
    throw error;
  }

  const totalAptNeeded = accountsToFund.length * config.aptAmount * 1e8; // Convert to octas
  if (deployerBalance < totalAptNeeded) {
    console.error(`[FundWallets] ❌ Insufficient deployer balance!`);
    console.error(`[FundWallets] Need: ${totalAptNeeded / 1e8} APT`);
    console.error(`[FundWallets] Have: ${deployerBalance / 1e8} APT`);
    throw new Error("Insufficient deployer balance");
  }

  // Fund each account
  for (const { name, account } of accountsToFund) {
    const address = account.accountAddress.toString();
    console.log(`\n[FundWallets] Processing ${name}: ${address}`);

    try {
      // Check current APT balance
      let currentBalance = 0;
      try {
        const balance = await aptos.view({
          payload: {
            function: "0x1::coin::balance",
            typeArguments: ["0x1::aptos_coin::AptosCoin"],
            functionArguments: [address],
          },
        });
        currentBalance = parseInt(balance[0] as string);
      } catch (error) {
        // Account doesn't exist yet
        currentBalance = 0;
      }

      console.log(`[FundWallets] Current balance: ${currentBalance / 1e8} APT`);

      // Transfer APT
      const aptAmountOctas = Math.floor(config.aptAmount * 1e8);
      console.log(`[FundWallets] Transferring ${config.aptAmount} APT...`);
      
      const transferTxn = await aptos.transaction.build.simple({
        sender: deployer.accountAddress,
        data: {
          function: "0x1::aptos_account::transfer",
          functionArguments: [address, aptAmountOctas.toString()],
        },
      });

      const transferResult = await aptos.signAndSubmitTransaction({
        signer: deployer,
        transaction: transferTxn,
      });

      await aptos.waitForTransaction({
        transactionHash: transferResult.hash,
      });

      console.log(`[FundWallets] ✅ APT transferred successfully`);

      // Register and mint tokens if requested
      if (config.mintTokens) {
        // Register coins first (might fail if already registered, that's ok)
        for (const coinType of [`${packageAddress}::test_coin::TestUSDT`, `${packageAddress}::test_coin::TestDAI`]) {
          try {
            const registerTxn = await aptos.transaction.build.simple({
              sender: account.accountAddress,
              data: {
                function: "0x1::managed_coin::register",
                typeArguments: [coinType],
                functionArguments: [],
              },
            });

            const registerResult = await aptos.signAndSubmitTransaction({
              signer: account,
              transaction: registerTxn,
            });

            await aptos.waitForTransaction({
              transactionHash: registerResult.hash,
            });

            console.log(`[FundWallets] ✅ Registered ${coinType.includes("USDT") ? "USDT" : "DAI"}`);
          } catch (error: any) {
            if (error.message?.includes("ECOIN_STORE_ALREADY_PUBLISHED")) {
              console.log(`[FundWallets] ${coinType.includes("USDT") ? "USDT" : "DAI"} already registered`);
            } else {
              console.error(`[FundWallets] Failed to register coin:`, error.message);
            }
          }
        }

        // Mint tokens
        const tokenAmountBase = config.tokenAmount * 1e6; // Convert to base units (6 decimals)
        
        // Mint USDT
        try {
          const mintUSDTTxn = await aptos.transaction.build.simple({
            sender: deployer.accountAddress,
            data: {
              function: `${packageAddress}::test_coin::mint_usdt`,
              functionArguments: [address, tokenAmountBase.toString()],
            },
          });

          const usdtResult = await aptos.signAndSubmitTransaction({
            signer: deployer,
            transaction: mintUSDTTxn,
          });

          await aptos.waitForTransaction({
            transactionHash: usdtResult.hash,
          });

          console.log(`[FundWallets] ✅ Minted ${config.tokenAmount} USDT`);
        } catch (error) {
          console.error("[FundWallets] Failed to mint USDT:", error);
        }

        // Mint DAI
        try {
          const mintDAITxn = await aptos.transaction.build.simple({
            sender: deployer.accountAddress,
            data: {
              function: `${packageAddress}::test_coin::mint_dai`,
              functionArguments: [address, tokenAmountBase.toString()],
            },
          });

          const daiResult = await aptos.signAndSubmitTransaction({
            signer: deployer,
            transaction: mintDAITxn,
          });

          await aptos.waitForTransaction({
            transactionHash: daiResult.hash,
          });

          console.log(`[FundWallets] ✅ Minted ${config.tokenAmount} DAI`);
        } catch (error) {
          console.error("[FundWallets] Failed to mint DAI:", error);
        }
      }

    } catch (error) {
      console.error(`[FundWallets] ❌ Failed to fund ${name}:`, error);
      throw error;
    }
  }

  console.log("\n[FundWallets] ✅ All wallets funded successfully!");
  
  // Print summary
  console.log("\n[FundWallets] Summary:");
  console.log("═══════════════════════════════════════════════════════════");
  for (const { name, account } of accountsToFund) {
    const address = account.accountAddress.toString();
    console.log(`${name}: ${address}`);
    
    // Check final balances
    try {
      const aptBalance = await aptos.view({
        payload: {
          function: "0x1::coin::balance",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [address],
        },
      });
      console.log(`  APT: ${parseInt(aptBalance[0] as string) / 1e8}`);
    } catch (error) {
      console.log(`  APT: Error checking balance`);
    }

    if (config.mintTokens) {
      try {
        const usdtBalance = await aptos.view({
          payload: {
            function: "0x1::coin::balance",
            typeArguments: [`${packageAddress}::test_coin::TestUSDT`],
            functionArguments: [address],
          },
        });
        console.log(`  USDT: ${parseInt(usdtBalance[0] as string) / 1e6}`);
      } catch (error) {
        console.log(`  USDT: 0 (not registered)`);
      }

      try {
        const daiBalance = await aptos.view({
          payload: {
            function: "0x1::coin::balance",
            typeArguments: [`${packageAddress}::test_coin::TestDAI`],
            functionArguments: [address],
          },
        });
        console.log(`  DAI: ${parseInt(daiBalance[0] as string) / 1e6}`);
      } catch (error) {
        console.log(`  DAI: 0 (not registered)`);
      }
    }
  }
  console.log("═══════════════════════════════════════════════════════════");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const config: FundingConfig = {
    aptAmount: parseFloat(process.argv[2] || "0.5"),
    mintTokens: process.argv[3] !== "false",
    tokenAmount: parseFloat(process.argv[4] || "1000"),
  };

  console.log("[FundWallets] Configuration:");
  console.log("  APT per wallet:", config.aptAmount);
  console.log("  Mint tokens:", config.mintTokens);
  console.log("  Token amount:", config.tokenAmount);

  fundWallets(config).catch(error => {
    console.error("Failed to fund wallets:", error);
    process.exit(1);
  });
}

export { fundWallets, type FundingConfig };