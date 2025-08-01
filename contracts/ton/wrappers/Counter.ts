import { 
    Contract, 
    ContractProvider, 
    Sender, 
    Address, 
    Cell, 
    contractAddress, 
    beginCell
} from "@ton/core";

export type CounterConfig = {
    counter: number;
};

export function counterConfigToCell(config: CounterConfig): Cell {
    return beginCell()
        .storeInt(config.counter, 32)
        .endCell();
}

export const Opcodes = {
    increment: 0x00000001,
    decrement: 0x00000002
};

export class Counter implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Counter(address);
    }

    static createFromConfig(config: CounterConfig, code: Cell, workchain = 0) {
        const data = counterConfigToCell(config);
        const init = { code, data };
        return new Counter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: 2,
            body: beginCell().endCell(),
        });
    }

    async sendIncrement(
        provider: ContractProvider, 
        via: Sender, 
        opts: {
            value: bigint;
            queryId?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 2,
            body: beginCell()
                .storeUint(Opcodes.increment, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .endCell(),
        });
    }

    async sendDecrement(
        provider: ContractProvider, 
        via: Sender, 
        opts: {
            value: bigint;
            queryId?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 2,
            body: beginCell()
                .storeUint(Opcodes.decrement, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .endCell(),
        });
    }

    async getCounter(provider: ContractProvider): Promise<number> {
        const result = await provider.get("get_counter", []);
        return result.stack.readNumber();
    }
}