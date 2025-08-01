import { Address, toNano } from "@ton/core";
import { Counter } from "../wrappers/Counter";
import { NetworkProvider } from "@ton/blueprint";

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input("Counter address"));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const counter = provider.open(Counter.createFromAddress(address));

    const counterBefore = await counter.getCounter();
    console.log("[Increment] Counter value before:", counterBefore);

    await counter.sendIncrement(provider.sender(), {
        value: toNano("0.05"),
    });

    ui.write("Waiting for counter to increment...");

    let counterAfter = await counter.getCounter();
    let attempt = 1;
    while (counterAfter === counterBefore) {
        ui.setActionPrompt(`Attempt ${attempt}`);
        await sleep(2000);
        counterAfter = await counter.getCounter();
        attempt++;
    }

    ui.clearActionPrompt();
    console.log("[Increment] Counter value after:", counterAfter);
    ui.write("Counter incremented successfully!");
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}