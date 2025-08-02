import { Address, fromNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    let address: Address;
    
    if (args.length > 0) {
        try {
            address = Address.parse(args[0]);
        } catch (error) {
            ui.write("❌ Invalid address format");
            return;
        }
    } else {
        address = provider.sender().address!;
    }

    console.log("\n💰 Checking Balance");
    console.log("📍 Address:", address.toString());

    try {
        const balance = await provider.provider.getBalance(address);
        const balanceTon = fromNano(balance);
        
        console.log("💎 Balance:", balanceTon, "TON");
        console.log("📊 Balance (nanotons):", balance.toString());
        
        // Provide context about balance adequacy
        if (balance < 100000000n) { // < 0.1 TON
            console.log("⚠️  Low balance - may not be sufficient for transactions");
        } else if (balance < 1000000000n) { // < 1 TON
            console.log("⚡ Moderate balance - sufficient for testing");
        } else {
            console.log("✅ Good balance - sufficient for extensive testing");
        }

        ui.write(`Balance: ${balanceTon} TON`);
        
        return {
            address: address.toString(),
            balance: balance.toString(),
            balanceTon: balanceTon
        };
    } catch (error) {
        console.log("❌ Failed to get balance:", error);
        ui.write("Failed to get balance ❌");
    }
}
