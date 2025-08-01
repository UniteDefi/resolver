import { Address } from "@ton/core";
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
    
    const counterValue = await counter.getCounter();
    console.log("[GetCounter] Current counter value:", counterValue);
    ui.write(`Current counter value: ${counterValue}`);
}