#[starknet::contract]
mod MockWrappedNative {
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
        Deposit: Deposit,
        Withdrawal: Withdrawal,
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct Deposit {
        #[key]
        dst: ContractAddress,
        wad: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Withdrawal {
        #[key]
        src: ContractAddress,
        wad: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, name: felt252, symbol: felt252) {
        self.erc20.initializer(name, symbol, 18);
    }

    #[abi(embed_v0)]
    impl WrappedNativeImpl of crate::interfaces::iwrapped_native::IWrappedNative<ContractState> {
        fn deposit(ref self: ContractState) {
            let caller = starknet::get_caller_address();
            let amount = 1000000000000000000_u256; // 1 ETH equivalent
            self.erc20._mint(caller, amount);
            self.emit(Deposit { dst: caller, wad: amount });
        }

        fn withdraw(ref self: ContractState, wad: u256) {
            let caller = starknet::get_caller_address();
            self.erc20._mint(caller, wad);
            self.emit(Withdrawal { src: caller, wad });
        }
    }
}
