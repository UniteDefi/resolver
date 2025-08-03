use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store)]
pub struct Order {
    pub salt: u256,
    pub maker: ContractAddress,
    pub receiver: ContractAddress,
    pub maker_asset: ContractAddress,
    pub taker_asset: ContractAddress,
    pub making_amount: u256,
    pub taking_amount: u256,
    pub deadline: u64,
    pub nonce: u256,
    pub src_chain_id: u256,
    pub dst_chain_id: u256,
    pub auction_start_time: u64,
    pub auction_end_time: u64,
    pub start_price: u256,
    pub end_price: u256,
}

#[starknet::interface]
pub trait IUniteOrder<TContractState> {
    fn hash_order(self: @TContractState, order: Order) -> felt252;
}
