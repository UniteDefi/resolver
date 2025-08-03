use starknet::ContractAddress;
use super::iunite_order::Order;

#[derive(Drop, Serde)]
pub struct TakerTraits {
    value: u256,
}

#[starknet::interface]
pub trait IOrderMixin<TContractState> {
    fn fill_order_args(
        ref self: TContractState,
        order: Order,
        r: felt252,
        vs: felt252,
        amount: u256,
        taker_traits: TakerTraits,
        args: Array<felt252>
    ) -> (u256, u256, felt252); // (making_amount, taking_amount, order_hash)
}
