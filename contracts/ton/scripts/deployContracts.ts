import { toNano, Address } from "@ton/core";
import { UniteEscrow } from "../wrappers/UniteEscrow";
import { UniteEscrowFactory } from "../wrappers/UniteEscrowFactory";
import { compile, NetworkProvider } from "@ton/blueprint";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

export async function run(provider: NetworkProvider) {
    console.log("\n🚀 Starting TON Unite Protocol deployment...");

    // Check if we're deploying to testnet
    const network = provider.network();
    console.log(`📡 Network: ${network}`);

    // Compile contracts
    console.log("📦 Compiling contracts...");
    const escrowCode = await compile("UniteEscrow");
    const factoryCode = await compile("UniteEscrowFactory");

    console.log("✅ Contracts compiled successfully");
    console.log(`📏 Escrow code size: ${escrowCode.toBoc().length} bytes`);
    console.log(`📏 Factory code size: ${factoryCode.toBoc().length} bytes`);

    // Deploy factory
    console.log("\n🏗️  Deploying Escrow Factory...");
    
    const factory = provider.open(
        UniteEscrowFactory.createFromConfig(
            {
                owner: provider.sender().address!,
                escrowCode: escrowCode,
            },
            factoryCode
        )
    );

    console.log("📍 Factory address:", factory.address);
    console.log("👤 Owner address:", provider.sender().address!);

    // Check if already deployed
    const isDeployed = await provider.isContractDeployed(factory.address);
    if (isDeployed) {
        console.log("⚠️  Factory already deployed at this address");
        console.log("🔍 Checking factory state...");
        
        // Verify it's working
        try {
            const testOrderHash = BigInt("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
            const escrowAddr = await factory.getSrcEscrowAddress(testOrderHash);
            console.log("✅ Factory is responsive");
            console.log("📍 Test escrow address:", escrowAddr);
        } catch (error) {
            console.log("❌ Factory is not responsive:", error);
        }
    } else {
        console.log("💰 Deploying with", toNano("0.5").toString(), "nanotons...");
        
        await factory.sendDeploy(provider.sender(), toNano("0.5"));
        await provider.waitForDeploy(factory.address);

        console.log("✅ Factory deployed successfully!");
        
        // Verify deployment
        try {
            const testOrderHash = BigInt("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
            const escrowAddr = await factory.getSrcEscrowAddress(testOrderHash);
            console.log("✅ Factory verification successful");
            console.log("📍 Test escrow address:", escrowAddr);
        } catch (error) {
            console.log("⚠️  Factory verification failed:", error);
        }
    }

    // Create/update deployments.json
    console.log("\n📝 Updating deployments.json...");
    
    let deployments: any = {};
    const deploymentsPath = join(process.cwd(), "deployments.json");
    
    if (existsSync(deploymentsPath)) {
        try {
            const existingData = readFileSync(deploymentsPath, "utf8");
            deployments = JSON.parse(existingData);
        } catch (error) {
            console.log("⚠️  Could not read existing deployments.json, creating new one");
        }
    }

    // Ensure structure exists
    if (!deployments.ton) {
        deployments.ton = {};
    }
    if (!deployments.ton.testnet) {
        deployments.ton.testnet = {};
    }

    // Update TON deployment info
    deployments.ton.testnet = {
        ...deployments.ton.testnet,
        UniteEscrowFactory: factory.address.toString(),
        UniteEscrowCode: escrowCode.toBoc().toString("base64"),
        deployedAt: Date.now(),
        network: "testnet",
        chainId: -3, // TON testnet
        rpc: "https://testnet.toncenter.com/api/v2/jsonRPC",
        owner: provider.sender().address!.toString()
    };

    // Preserve EVM deployments if they exist
    if (!deployments.evm) {
        deployments.evm = {
            base_sepolia: {
                UniteLimitOrderProtocol: "REPLACE_WITH_ACTUAL_ADDRESS",
                UniteEscrowFactory: "REPLACE_WITH_ACTUAL_ADDRESS", 
                UniteResolver0: "REPLACE_WITH_ACTUAL_ADDRESS",
                UniteResolver1: "REPLACE_WITH_ACTUAL_ADDRESS",
                UniteResolver2: "REPLACE_WITH_ACTUAL_ADDRESS",
                MockUSDT: "REPLACE_WITH_ACTUAL_ADDRESS",
                MockDAI: "REPLACE_WITH_ACTUAL_ADDRESS",
                chainId: 84532,
                rpc: "https://sepolia.base.org",
                note: "Replace with actual addresses from evm-partial deployment"
            }
        };
    }

    // Write updated deployments
    writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    
    console.log("✅ Deployments updated successfully");
    console.log("📄 Saved to:", deploymentsPath);

    // Print summary
    console.log("\n🎉 Deployment Summary");
    console.log("=" .repeat(50));
    console.log("📍 Factory Address:", factory.address.toString());
    console.log("👤 Owner Address:", provider.sender().address!.toString());
    console.log("🔗 Network:", network);
    console.log("⛽ Gas Used: ~0.5 TON");
    console.log("📦 Escrow Code:", escrowCode.toBoc().toString("base64").slice(0, 32) + "...");
    
    console.log("\n🔗 Next Steps:");
    console.log("1. Update EVM addresses in deployments.json");
    console.log("2. Run cross-chain tests: npm test");
    console.log("3. Fund test accounts for integration testing");
    
    console.log("\n📚 Useful Commands:");
    console.log("- Test factory:", `npm run blueprint run testFactory ${factory.address}`);
    console.log("- Check balance:", `npm run blueprint run checkBalance ${provider.sender().address!}`);

    return {
        factory: factory.address,
        escrowCode,
        owner: provider.sender().address!
    };
}
