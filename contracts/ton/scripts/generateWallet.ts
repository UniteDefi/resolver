import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";

async function generateWallet() {
    // Generate new mnemonic
    const mnemonics = await mnemonicNew(24);
    console.log("[Wallet] Generated mnemonic:");
    console.log(mnemonics.join(" "));
    console.log("");

    // Create wallet from mnemonic
    const keyPair = await mnemonicToPrivateKey(mnemonics);
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });

    console.log("[Wallet] Wallet address (testnet):");
    console.log(wallet.address.toString({ testOnly: true, bounceable: false }));
    console.log("");
    
    console.log("[Wallet] Wallet address (mainnet):");
    console.log(wallet.address.toString({ testOnly: false, bounceable: false }));
    console.log("");

    console.log("[Wallet] Raw address:");
    console.log(wallet.address.toRawString());
    console.log("");

    console.log("IMPORTANT: Save the mnemonic securely! Add it to your .env file as DEPLOYER_MNEMONIC");
    console.log("Fund the testnet address at: https://t.me/testgiver_ton_bot");
}

generateWallet().catch(console.error);