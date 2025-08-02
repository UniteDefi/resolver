import { Address, toNano, fromNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    console.log("\n💸 Funding Test Accounts");
    
    // Default test addresses - replace with your actual test addresses
    const testAddresses = [
        "0QAO3w5QGT5GKxnhPSHrtGMZSCOzD4LlhcyNyuL_8Gl7-_pF", // Test user
        "0QBE3u5GDvIIKEQGOUi8QcqfyW1Y7t8yLLHQGqT5YgO3pI8h", // Test resolver 1
        "0QCF4v6IEvJJLFRHPVi9RdqgzX2Z8u9zMMIRHrU6ZhQ4qJ9i", // Test resolver 2
    ];

    // Override with command line args if provided
    const addresses = args.length > 0 ? args : testAddresses;
    const amountPerAccount = toNano("2"); // 2 TON per account

    console.log("💰 Amount per account:", fromNano(amountPerAccount), "TON");
    console.log("👤 Funder address:", provider.sender().address!);

    // Check funder balance
    const funderBalance = await provider.provider.getBalance(provider.sender().address!);
    const requiredTotal = amountPerAccount * BigInt(addresses.length);
    
    console.log("📊 Funder balance:", fromNano(funderBalance), "TON");
    console.log("📋 Required total:", fromNano(requiredTotal), "TON");

    if (funderBalance < requiredTotal + toNano("1")) { // +1 TON buffer for fees
        ui.write("❌ Insufficient balance to fund all accounts");
        return;
    }

    // Fund each account
    for (let i = 0; i < addresses.length; i++) {
        const addressStr = addresses[i];
        
        try {
            const address = Address.parse(addressStr);
            
            console.log(`\n📤 Funding account ${i + 1}/${addresses.length}`);
            console.log("📍 Address:", address.toString());
            
            // Check current balance
            const currentBalance = await provider.provider.getBalance(address);
            console.log("💎 Current balance:", fromNano(currentBalance), "TON");
            
            if (currentBalance >= amountPerAccount) {
                console.log("✅ Account already has sufficient balance");
                continue;
            }

            // Send funds
            await provider.sender().send({
                to: address,
                value: amountPerAccount,
                bounce: false
            });

            console.log("✅ Sent", fromNano(amountPerAccount), "TON");
            
            // Wait a bit between transactions
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.log(`❌ Failed to fund ${addressStr}:`, error);
        }
    }

    console.log("\n🎉 Account funding completed!");
    ui.write("Account funding completed ✅");
}
