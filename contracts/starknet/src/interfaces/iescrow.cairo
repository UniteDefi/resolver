use starknet::ContractAddress;
use super::ibase_escrow::Immutables;

#[starknet::interface]
trait IEscrow<TContractState> {
    fn withdraw(ref self: TContractState, secret: felt252, immutables: Immutables);
    fn cancel(ref self: TContractState, immutables: Immutables);
    fn withdraw_user(ref self: TContractState, secret: felt252, immutables: Immutables);
    fn withdraw_resolver(ref self: TContractState, secret: felt252, immutables: Immutables);
    fn withdraw_with_secret(ref self: TContractState, secret: felt252, immutables: Immutables);
}
