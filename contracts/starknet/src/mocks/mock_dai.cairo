#[starknet::contract]
mod MockDAI {
    use starknet::ContractAddress;
    use crate::components::erc20::{ERC20Component, ERC20Component::InternalTrait};

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    #[abi(embed_v0)]
    impl ERC20Impl = ERC20Component::ERC20Impl<ContractState>;
    
    #[abi(embed_v0)]
    impl ERC20MintableImpl = ERC20Component::ERC20MintableImpl<ContractState>;
    
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: felt252,
        symbol: felt252,
        decimals: u8,
        initial_supply: u256,
        recipient: ContractAddress
    ) {
        self.erc20.initializer(name, symbol, decimals);
        if initial_supply != 0 {
            self.erc20._mint(recipient, initial_supply);
        }
    }
}
