import { toNano, Address } from "@ton/core";
import { Counter } from "../wrappers/Counter";
import { TonClient, WalletContractV4 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import dotenv from "dotenv";

dotenv.config();

async function interactWithMnemonic() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log("Usage: ts-node scripts/interactWithMnemonic.ts <action> <contract_address>");
        console.log("Actions: increment, decrement, get");
        process.exit(1);
    }
    
    const action = args[0];
    const contractAddress = Address.parse(args[1]);
    
    // Check environment variables
    const mnemonic = process.env.DEPLOYER_MNEMONIC;
    const apiKey = process.env.TONCENTER_API_KEY;
    
    if (!mnemonic) {
        throw new Error("DEPLOYER_MNEMONIC not found in .env file");
    }
    
    if (!apiKey) {
        throw new Error("TONCENTER_API_KEY not found in .env file");
    }
    
    console.log(`[Interact] Starting ${action} operation...`);
    
    // Initialize TON client
    const client = new TonClient({
        endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
        apiKey: apiKey,
    });
    
    // Create wallet from mnemonic
    const key = await mnemonicToPrivateKey(mnemonic.split(" "));
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: key.publicKey,
    });
    const walletContract = client.open(wallet);
    
    // Open counter contract
    const counter = client.open(Counter.createFromAddress(contractAddress));
    
    switch (action) {
        case "get":
            const currentValue = await counter.getCounter();
            console.log(`[Interact] Current counter value: ${currentValue}`);
            break;
            
        case "increment":
            const valueBefore = await counter.getCounter();
            console.log(`[Interact] Counter value before increment: ${valueBefore}`);
            
            await counter.sendIncrement(walletContract.sender(key.secretKey), {
                value: toNano("0.05"),
            });
            
            console.log("[Interact] Increment transaction sent. Waiting for confirmation...");
            
            // Wait for value to change
            let newValue = valueBefore;
            let attempts = 0;
            while (newValue === valueBefore && attempts < 15) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                newValue = await counter.getCounter();
                attempts++;
                console.log(`[Interact] Checking value... (${attempts}/15)`);
            }
            
            console.log(`[Interact] Counter value after increment: ${newValue}`);
            break;
            
        case "decrement":
            const valueBeforeDec = await counter.getCounter();
            console.log(`[Interact] Counter value before decrement: ${valueBeforeDec}`);
            
            await counter.sendDecrement(walletContract.sender(key.secretKey), {
                value: toNano("0.05"),
            });
            
            console.log("[Interact] Decrement transaction sent. Waiting for confirmation...");
            
            // Wait for value to change
            let newValueDec = valueBeforeDec;
            let attemptsDec = 0;
            while (newValueDec === valueBeforeDec && attemptsDec < 15) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                newValueDec = await counter.getCounter();
                attemptsDec++;
                console.log(`[Interact] Checking value... (${attemptsDec}/15)`);
            }
            
            console.log(`[Interact] Counter value after decrement: ${newValueDec}`);
            break;
            
        default:
            console.log(`[Interact] Unknown action: ${action}`);
            console.log("Valid actions: get, increment, decrement");
            process.exit(1);
    }
}

interactWithMnemonic().catch(error => {
    console.error("[Interact] Error:", error);
    process.exit(1);
});