use starknet::ContractAddress;
use super::iunite_order::Order;

#[starknet::interface]
pub trait IUniteOrderProtocol<TContractState> {
    fn fill_order(
        ref self: TContractState,
        order: Order,
        signature: Array<felt252>,
        making_amount: u256,
        taking_amount: u256,
        target: ContractAddress
    ) -> (u256, u256, felt252); // (actual_making_amount, actual_taking_amount, order_hash)
    
    fn cancel_order(ref self: TContractState, order: Order);
    fn hash_order(self: @TContractState, order: Order) -> felt252;
    fn invalidated_orders(self: @TContractState, order_hash: felt252) -> bool;
    fn nonces(self: @TContractState, maker: ContractAddress) -> u256;
    fn get_filled_amount(self: @TContractState, order_hash: felt252) -> u256;
    fn get_remaining_amount(self: @TContractState, order: Order) -> u256;
    fn get_escrow_address(self: @TContractState, order_hash: felt252) -> ContractAddress;
    fn is_order_fully_filled(self: @TContractState, order_hash: felt252) -> bool;
}
