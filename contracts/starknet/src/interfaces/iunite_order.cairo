use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store)]
struct Order {
    salt: u256,
    maker: ContractAddress,
    receiver: ContractAddress,
    maker_asset: ContractAddress,
    taker_asset: ContractAddress,
    making_amount: u256,
    taking_amount: u256,
    deadline: u64,
    nonce: u256,
    src_chain_id: u256,
    dst_chain_id: u256,
    auction_start_time: u64,
    auction_end_time: u64,
    start_price: u256,
    end_price: u256,
}

#[starknet::interface]
trait IUniteOrder<TContractState> {
    fn hash_order(self: @TContractState, order: Order) -> felt252;
}
