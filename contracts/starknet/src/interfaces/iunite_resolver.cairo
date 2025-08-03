use starknet::ContractAddress;
use super::ibase_escrow::Immutables;
use super::iunite_order::Order;

#[starknet::interface]
pub trait IUniteResolver<TContractState> {
    fn deploy_src_compact_partial(
        ref self: TContractState,
        immutables: Immutables,
        order: Order,
        r: felt252,
        vs: felt252,
        amount: u256,
        partial_amount: u256
    );
    
    fn deploy_dst_partial(
        ref self: TContractState,
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        partial_amount: u256
    );
    
    fn withdraw(
        ref self: TContractState,
        escrow_address: ContractAddress,
        secret: felt252,
        immutables: Immutables
    );
    
    fn withdraw_user(
        ref self: TContractState,
        escrow_address: ContractAddress,
        secret: felt252,
        immutables: Immutables
    );
    
    fn withdraw_resolver(
        ref self: TContractState,
        escrow_address: ContractAddress,
        secret: felt252,
        immutables: Immutables
    );
    
    fn cancel(
        ref self: TContractState,
        escrow_address: ContractAddress,
        immutables: Immutables
    );
}
