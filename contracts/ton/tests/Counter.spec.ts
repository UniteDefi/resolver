import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Cell, toNano } from "@ton/core";
import { Counter } from "../wrappers/Counter";
import "@ton/test-utils";
import { compile } from "@ton/blueprint";

describe("Counter", () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile("Counter");
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let counter: SandboxContract<Counter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        counter = blockchain.openContract(
            Counter.createFromConfig(
                {
                    counter: 0,
                },
                code
            )
        );

        deployer = await blockchain.treasury("deployer");

        const deployResult = await counter.sendDeploy(deployer.getSender(), toNano("0.05"));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: counter.address,
            deploy: true,
            success: true,
        });
    });

    it("should deploy", async () => {
        // the check is done inside beforeEach
        // blockchain and counter are ready to use
    });

    it("should get initial counter value", async () => {
        const counterValue = await counter.getCounter();
        expect(counterValue).toBe(0);
    });

    it("should increment counter", async () => {
        console.log("[Counter Test] Initial counter value:", await counter.getCounter());
        
        const incrementResult = await counter.sendIncrement(deployer.getSender(), {
            value: toNano("0.05"),
        });

        expect(incrementResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: counter.address,
            success: true,
        });

        const counterValue = await counter.getCounter();
        console.log("[Counter Test] Counter value after increment:", counterValue);
        expect(counterValue).toBe(1);
    });

    it("should decrement counter", async () => {
        // First increment to 1
        await counter.sendIncrement(deployer.getSender(), {
            value: toNano("0.05"),
        });

        console.log("[Counter Test] Counter value before decrement:", await counter.getCounter());

        const decrementResult = await counter.sendDecrement(deployer.getSender(), {
            value: toNano("0.05"),
        });

        expect(decrementResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: counter.address,
            success: true,
        });

        const counterValue = await counter.getCounter();
        console.log("[Counter Test] Counter value after decrement:", counterValue);
        expect(counterValue).toBe(0);
    });

    it("should handle multiple operations", async () => {
        // Increment 3 times
        for (let i = 0; i < 3; i++) {
            await counter.sendIncrement(deployer.getSender(), {
                value: toNano("0.05"),
            });
        }

        let counterValue = await counter.getCounter();
        console.log("[Counter Test] Counter value after 3 increments:", counterValue);
        expect(counterValue).toBe(3);

        // Decrement once
        await counter.sendDecrement(deployer.getSender(), {
            value: toNano("0.05"),
        });

        counterValue = await counter.getCounter();
        console.log("[Counter Test] Counter value after 1 decrement:", counterValue);
        expect(counterValue).toBe(2);
    });

    it("should accept increment with query id", async () => {
        const queryId = 12345;
        
        const incrementResult = await counter.sendIncrement(deployer.getSender(), {
            value: toNano("0.05"),
            queryId: queryId,
        });

        expect(incrementResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: counter.address,
            success: true,
        });

        const counterValue = await counter.getCounter();
        expect(counterValue).toBe(1);
    });

    it("should handle negative values correctly", async () => {
        // Decrement from 0 should result in -1
        await counter.sendDecrement(deployer.getSender(), {
            value: toNano("0.05"),
        });

        const counterValue = await counter.getCounter();
        console.log("[Counter Test] Counter value after decrement from 0:", counterValue);
        expect(counterValue).toBe(-1);
    });
});