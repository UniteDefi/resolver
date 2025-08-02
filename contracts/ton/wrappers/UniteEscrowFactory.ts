import { 
    Contract, 
    ContractProvider, 
    Sender, 
    Address, 
    Cell, 
    contractAddress, 
    beginCell
} from "@ton/core";

export type FactoryConfig = {
    owner: Address;
    escrowCode: Cell;
};

export function factoryConfigToCell(config: FactoryConfig): Cell {
    return beginCell()
        .storeAddress(config.owner)
        .storeRef(config.escrowCode)
        .storeDict(null) // src_escrows
        .storeDict(null) // dst_escrows
        .storeDict(null) // resolver_amounts
        .storeDict(null) // resolver_deposits
        .storeDict(null) // total_amounts
        .endCell();
}

export const FactoryOpcodes = {
    createSrcEscrow: 1,
    createDstEscrow: 2,
    setEscrowCode: 3,
    getEscrowAddress: 4
};

export class UniteEscrowFactory implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new UniteEscrowFactory(address);
    }

    static createFromConfig(config: FactoryConfig, code: Cell, workchain = 0) {
        const data = factoryConfigToCell(config);
        const init = { code, data };
        return new UniteEscrowFactory(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: 2,
            body: beginCell().endCell(),
        });
    }

    async sendCreateSrcEscrow(
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
            partialAmount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 2,
            body: beginCell()
                .storeUint(FactoryOpcodes.createSrcEscrow, 32)
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
                .storeUint(opts.partialAmount, 64)
                .endCell(),
        });
    }

    async sendCreateDstEscrow(
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
            srcCancellationTimestamp: number;
            partialAmount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 2,
            body: beginCell()
                .storeUint(FactoryOpcodes.createDstEscrow, 32)
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
                .storeUint(opts.srcCancellationTimestamp, 32)
                .storeUint(opts.partialAmount, 64)
                .endCell(),
        });
    }

    async getSrcEscrowAddress(provider: ContractProvider, orderHash: bigint): Promise<Address> {
        const result = await provider.get("get_src_escrow_address", [
            { type: "int", value: orderHash }
        ]);
        return result.stack.readAddress();
    }

    async getDstEscrowAddress(provider: ContractProvider, orderHash: bigint): Promise<Address> {
        const result = await provider.get("get_dst_escrow_address", [
            { type: "int", value: orderHash }
        ]);
        return result.stack.readAddress();
    }

    async getTotalFilledAmount(provider: ContractProvider, orderHash: bigint): Promise<bigint> {
        const result = await provider.get("get_total_filled_amount", [
            { type: "int", value: orderHash }
        ]);
        return result.stack.readBigNumber();
    }
}
