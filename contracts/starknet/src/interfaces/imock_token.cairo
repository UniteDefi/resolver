use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockToken<TContractState> {
    fn mint(ref self: TContractState, to: ContractAddress, amount: u256);
    fn burn(ref self: TContractState, amount: u256);
}
