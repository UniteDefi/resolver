import { toNano } from "@ton/core";
import { Counter } from "../wrappers/Counter";
import { compile, NetworkProvider } from "@ton/blueprint";

export async function run(provider: NetworkProvider) {
    const counter = provider.open(
        Counter.createFromConfig(
            {
                counter: 0,
            },
            await compile("Counter")
        )
    );

    await counter.sendDeploy(provider.sender(), toNano("0.05"));

    await provider.waitForDeploy(counter.address);

    console.log("[Deploy] Counter deployed to:", counter.address);
    
    // Get initial counter value
    const initialValue = await counter.getCounter();
    console.log("[Deploy] Initial counter value:", initialValue);
}