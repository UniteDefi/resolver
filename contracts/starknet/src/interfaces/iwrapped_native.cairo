#[starknet::interface]
pub trait IWrappedNative<TContractState> {
    fn deposit(ref self: TContractState);
    fn withdraw(ref self: TContractState, wad: u256);
}
