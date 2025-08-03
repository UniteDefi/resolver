use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store)]
pub struct Immutables {
    order_hash: felt252,
    hashlock: felt252,
    maker: ContractAddress,
    taker: ContractAddress,
    token: ContractAddress,
    amount: u256,
    safety_deposit: u256,
    timelocks: u256,
}

#[starknet::interface]
pub trait IBaseEscrow<TContractState> {
    fn get_order_hash(self: @TContractState) -> felt252;
    fn get_hashlock(self: @TContractState) -> felt252;
    fn get_maker(self: @TContractState) -> ContractAddress;
    fn get_taker(self: @TContractState) -> ContractAddress;
    fn get_token(self: @TContractState) -> ContractAddress;
    fn get_amount(self: @TContractState) -> u256;
    fn get_safety_deposit(self: @TContractState) -> u256;
    fn get_timelocks(self: @TContractState) -> u256;
    fn get_state(self: @TContractState) -> u8; // 0=Active, 1=Withdrawn, 2=Cancelled
}
