use starknet::ContractAddress;
use super::ibase_escrow::Immutables;

#[starknet::interface]
trait IEscrowFactory<TContractState> {
    fn address_of_escrow_src(self: @TContractState, immutables: Immutables) -> ContractAddress;
    fn address_of_escrow_dst(self: @TContractState, immutables: Immutables) -> ContractAddress;
    fn create_src_escrow(ref self: TContractState, immutables: Immutables) -> ContractAddress;
    fn create_dst_escrow(ref self: TContractState, immutables: Immutables, src_cancellation_timestamp: u64) -> ContractAddress;
    fn create_src_escrow_partial(ref self: TContractState, immutables: Immutables, partial_amount: u256) -> ContractAddress;
    fn create_dst_escrow_partial(ref self: TContractState, immutables: Immutables, src_cancellation_timestamp: u64, partial_amount: u256) -> ContractAddress;
    fn create_src_escrow_partial_for(ref self: TContractState, immutables: Immutables, partial_amount: u256, resolver: ContractAddress) -> ContractAddress;
    fn create_dst_escrow_partial_for(ref self: TContractState, immutables: Immutables, src_cancellation_timestamp: u64, partial_amount: u256, resolver: ContractAddress) -> ContractAddress;
    fn get_resolver_partial_amount(self: @TContractState, order_hash: felt252, resolver: ContractAddress) -> u256;
    fn get_resolver_safety_deposit(self: @TContractState, order_hash: felt252, resolver: ContractAddress) -> u256;
    fn get_total_filled_amount(self: @TContractState, order_hash: felt252) -> u256;
}
