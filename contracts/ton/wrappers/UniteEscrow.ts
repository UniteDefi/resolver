import { 
    Contract, 
    ContractProvider, 
    Sender, 
    Address, 
    Cell, 
    contractAddress, 
    beginCell,
    toNano
} from "@ton/core";

export type EscrowConfig = {
    state: number;
    orderHash: bigint;
    isSource: boolean;
};

export function escrowConfigToCell(config: EscrowConfig): Cell {
    return beginCell()
        .storeUint(config.state, 32)
        .storeUint(config.orderHash, 256)
        .storeBit(config.isSource)
        .endCell();
}

export const EscrowOpcodes = {
    initialize: 1,
    initializeDst: 2,
    addResolver: 3,
    withdrawWithSecret: 4,
    cancel: 5,
    depositJettons: 6
};

export class UniteEscrow implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new UniteEscrow(address);
    }

    static createFromConfig(config: EscrowConfig, code: Cell, workchain = 0) {
        const data = escrowConfigToCell(config);
        const init = { code, data };
        return new UniteEscrow(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: 2,
            body: beginCell().endCell(),
        });
    }

    async sendInitialize(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            orderHash: bigint;
            hashlock: bigint;
            maker: Address;
            taker: Address;
            token: Address | null;
            totalAmount: bigint;
            safetyDeposit: bigint;
            timelocks: {
                srcWithdrawal: number;
                srcPublicWithdrawal: number;
                srcCancellation: number;
                srcPublicCancellation: number;
                dstWithdrawal: number;
                dstPublicWithdrawal: number;
                dstCancellation: number;
            };
            isSource: boolean;
            partialAmount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 2,
            body: beginCell()
                .storeUint(EscrowOpcodes.initialize, 32)
                .storeUint(0, 64) // query_id
                .storeUint(opts.orderHash, 256)
                .storeUint(opts.hashlock, 256)
                .storeAddress(opts.maker)
                .storeAddress(opts.taker)
                .storeAddress(opts.token)
                .storeUint(opts.totalAmount, 64)
                .storeUint(opts.safetyDeposit, 64)
                .storeUint(opts.timelocks.srcWithdrawal, 32)
                .storeUint(opts.timelocks.srcPublicWithdrawal, 32)
                .storeUint(opts.timelocks.srcCancellation, 32)
                .storeUint(opts.timelocks.srcPublicCancellation, 32)
                .storeUint(opts.timelocks.dstWithdrawal, 32)
                .storeUint(opts.timelocks.dstPublicWithdrawal, 32)
                .storeUint(opts.timelocks.dstCancellation, 32)
                .storeBit(opts.isSource)
                .storeUint(opts.partialAmount, 64)
                .endCell(),
        });
    }

    async sendWithdrawWithSecret(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            secret: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 2,
            body: beginCell()
                .storeUint(EscrowOpcodes.withdrawWithSecret, 32)
                .storeUint(0, 64) // query_id
                .storeUint(opts.secret, 256)
                .endCell(),
        });
    }

    async sendCancel(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 2,
            body: beginCell()
                .storeUint(EscrowOpcodes.cancel, 32)
                .storeUint(0, 64) // query_id
                .endCell(),
        });
    }

    async getState(provider: ContractProvider): Promise<number> {
        const result = await provider.get("get_state", []);
        return result.stack.readNumber();
    }

    async getOrderHash(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get("get_order_hash", []);
        return result.stack.readBigNumber();
    }

    async getTotalPartialAmount(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get("get_total_partial_amount", []);
        return result.stack.readBigNumber();
    }
}
