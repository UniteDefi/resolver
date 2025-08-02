#[starknet::contract]
mod MockWrappedNative {
    use starknet::ContractAddress;
    use openzeppelin::token::erc20::ERC20Component;
    use openzeppelin::access::ownable::OwnableComponent;

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl ERC20Impl = ERC20Component::ERC20Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC20MetadataImpl = ERC20Component::ERC20MetadataImpl<ContractState>;
    #[abi(embed_v0)]
    impl ERC20CamelOnlyImpl = ERC20Component::ERC20CamelOnlyImpl<ContractState>;
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;

    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Deposit: Deposit,
        Withdrawal: Withdrawal,
        #[flat]
        ERC20Event: ERC20Component::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event
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
    fn constructor(ref self: ContractState, name: ByteArray, symbol: ByteArray) {
        self.erc20.initializer(name, symbol);
        self.ownable.initializer(starknet::get_caller_address());
    }

    #[abi(embed_v0)]
    impl MockWrappedNativeImpl of super::super::interfaces::imock_token::IMockToken<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            self.ownable.assert_only_owner();
            self.erc20._mint(to, amount);
        }

        fn burn(ref self: ContractState, amount: u256) {
            let caller = starknet::get_caller_address();
            self.erc20._burn(caller, amount);
        }
    }

    #[abi(embed_v0)]
    impl WrappedNativeImpl of super::super::interfaces::iwrapped_native::IWrappedNative<ContractState> {
        fn deposit(ref self: ContractState) {
            // In StarkNet, we can't receive ETH directly like in Ethereum
            // This is a simplified mock implementation
            let caller = starknet::get_caller_address();
            // Amount would come from a parameter in real implementation
            let amount = 1000000000000000000_u256; // 1 ETH equivalent
            self.erc20._mint(caller, amount);
            self.emit(Deposit { dst: caller, wad: amount });
        }

        fn withdraw(ref self: ContractState, wad: u256) {
            let caller = starknet::get_caller_address();
            self.erc20._burn(caller, wad);
            // In real implementation, would transfer native ETH
            self.emit(Withdrawal { src: caller, wad });
        }
    }
}
