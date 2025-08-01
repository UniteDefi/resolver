import { toNano } from "@ton/core";
import { Counter } from "../wrappers/Counter";
import { compile } from "@ton/blueprint";
import { TonClient, WalletContractV4, internal } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import dotenv from "dotenv";

dotenv.config();

async function deployWithMnemonic() {
    // Check environment variables
    const mnemonic = process.env.DEPLOYER_MNEMONIC;
    const apiKey = process.env.TONCENTER_API_KEY;
    
    if (!mnemonic) {
        throw new Error("DEPLOYER_MNEMONIC not found in .env file");
    }
    
    if (!apiKey) {
        throw new Error("TONCENTER_API_KEY not found in .env file");
    }
    
    console.log("[Deploy] Starting deployment process...");
    
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
    
    console.log("[Deploy] Wallet address:", wallet.address);
    
    // Check wallet balance
    const balance = await walletContract.getBalance();
    console.log("[Deploy] Wallet balance:", balance / 1000000000n, "TON");
    
    if (balance === 0n) {
        throw new Error("Wallet has zero balance. Please fund it first.");
    }
    
    // Compile contract
    console.log("[Deploy] Compiling contract...");
    const code = await compile("Counter");
    
    // Create contract instance
    const counter = Counter.createFromConfig(
        {
            counter: 0,
        },
        code
    );
    
    console.log("[Deploy] Contract address will be:", counter.address);
    
    // Deploy contract
    console.log("[Deploy] Deploying contract...");
    const deployAmount = toNano("0.05");
    
    const seqno = await walletContract.getSeqno();
    
    await walletContract.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [
            internal({
                to: counter.address,
                value: deployAmount,
                init: counter.init,
                body: counter.init?.data,
            }),
        ],
    });
    
    console.log("[Deploy] Transaction sent. Waiting for confirmation...");
    
    // Wait for contract deployment
    let retries = 0;
    const maxRetries = 30;
    
    while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const contractState = await client.getContractState(counter.address);
        if (contractState.state === "active") {
            console.log("[Deploy] Contract deployed successfully!");
            break;
        }
        
        retries++;
        console.log(`[Deploy] Waiting for deployment... (${retries}/${maxRetries})`);
    }
    
    if (retries === maxRetries) {
        console.log("[Deploy] Warning: Contract deployment confirmation timeout");
        console.log("[Deploy] Contract address:", counter.address);
        return;
    }
    
    // Verify deployment by getting counter value
    const contractClient = client.open(counter);
    try {
        const counterValue = await contractClient.getCounter();
        console.log("[Deploy] Initial counter value:", counterValue);
        console.log("[Deploy] Deployment verified successfully!");
    } catch (error) {
        console.log("[Deploy] Warning: Could not verify deployment:", error);
    }
    
    console.log("\n[Deploy] Contract deployed to:", counter.address);
    console.log("[Deploy] You can now interact with it using:");
    console.log(`  npm run deploy incrementCounter ${counter.address}`);
    console.log(`  npm run deploy decrementCounter ${counter.address}`);
    console.log(`  npm run deploy getCounter ${counter.address}`);
}

deployWithMnemonic().catch(error => {
    console.error("[Deploy] Error:", error);
    process.exit(1);
});