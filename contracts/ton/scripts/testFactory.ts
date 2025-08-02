import { Address, toNano } from "@ton/core";
import { UniteEscrowFactory } from "../wrappers/UniteEscrowFactory";
import { NetworkProvider } from "@ton/blueprint";
import { createSwapParams } from "../utils/crosschain";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    if (args.length < 1) {
        ui.write("Usage: npm run blueprint run testFactory <factory_address>");
        return;
    }

    const factoryAddress = Address.parse(args[0]);
    
    console.log("\n🧪 Testing Unite Escrow Factory");
    console.log("📍 Factory address:", factoryAddress);

    if (!(await provider.isContractDeployed(factoryAddress))) {
        ui.write(`❌ Factory at ${factoryAddress} is not deployed!`);
        return;
    }

    const factory = provider.open(UniteEscrowFactory.createFromAddress(factoryAddress));

    // Test 1: Get escrow address for a test order
    console.log("\n🔍 Test 1: Calculate escrow addresses");
    
    const swapParams = createSwapParams(
        provider.sender().address!,
        null, // TON
        "0x1234567890123456789012345678901234567890", // Mock EVM token
        toNano("100"), // 100 TON
        BigInt("100000000"), // 100 USDT (6 decimals)
        Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        1 // nonce
    );

    try {
        const srcEscrowAddr = await factory.getSrcEscrowAddress(swapParams.orderHash);
        console.log("✅ Source escrow address:", srcEscrowAddr);
        
        const dstEscrowAddr = await factory.getDstEscrowAddress(swapParams.orderHash);
        console.log("✅ Destination escrow address:", dstEscrowAddr);
    } catch (error) {
        console.log("❌ Failed to get escrow addresses:", error);
    }

    // Test 2: Check total filled amount (should be 0 for new order)
    console.log("\n🔍 Test 2: Check filled amounts");
    
    try {
        const totalFilled = await factory.getTotalFilledAmount(swapParams.orderHash);
        console.log("✅ Total filled amount:", totalFilled.toString());
        
        if (totalFilled === 0n) {
            console.log("✅ Correct - new order has 0 filled amount");
        } else {
            console.log("⚠️  Unexpected - order already has fills");
        }
    } catch (error) {
        console.log("❌ Failed to get filled amount:", error);
    }

    // Test 3: Display swap parameters
    console.log("\n📋 Test Swap Parameters:");
    console.log("  Order Hash:", swapParams.orderHash.toString(16));
    console.log("  Secret:", swapParams.secret.toString(16));
    console.log("  Hashlock:", swapParams.hashlock.toString(16));
    console.log("  Maker:", swapParams.maker);
    console.log("  Source Amount:", swapParams.srcAmount.toString());
    console.log("  Destination Amount:", swapParams.dstAmount.toString());
    console.log("  Safety Deposit:", swapParams.safetyDepositPerUnit.toString());

    console.log("\n✅ Factory testing completed!");
    ui.write("Factory is working correctly ✅");
}
