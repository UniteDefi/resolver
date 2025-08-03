#[starknet::contract]
mod SimpleMockWrappedNative {
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        name: felt252,
        symbol: felt252,
        decimals: u8,
        total_supply: u256,
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Transfer: Transfer,
        Approval: Approval,
        Deposit: Deposit,
        Withdrawal: Withdrawal,
    }

    #[derive(Drop, starknet::Event)]
    struct Transfer {
        #[key]
        from: ContractAddress,
        #[key]
        to: ContractAddress,
        value: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Approval {
        #[key]
        owner: ContractAddress,
        #[key]
        spender: ContractAddress,
        value: u256,
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
        self.name.write(name);
        self.symbol.write(symbol);
        self.decimals.write(18);
    }

    #[abi(embed_v0)]
    impl ERC20Impl of crate::interfaces::ierc20_simple::IERC20<ContractState> {
        fn name(self: @ContractState) -> felt252 {
            self.name.read()
        }

        fn symbol(self: @ContractState) -> felt252 {
            self.symbol.read()
        }

        fn decimals(self: @ContractState) -> u8 {
            self.decimals.read()
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
            self.allowances.read((owner, spender))
        }

        fn transfer(ref self: ContractState, to: ContractAddress, amount: u256) -> bool {
            let caller = starknet::get_caller_address();
            self._transfer(caller, to, amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            amount: u256
        ) -> bool {
            let caller = starknet::get_caller_address();
            let current_allowance = self.allowances.read((from, caller));
            if current_allowance != 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff_u256 {
                assert!(current_allowance >= amount, "ERC20: insufficient allowance");
                self.allowances.write((from, caller), current_allowance - amount);
            }
            self._transfer(from, to, amount);
            true
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            let caller = starknet::get_caller_address();
            self.allowances.write((caller, spender), amount);
            self.emit(Approval { owner: caller, spender, value: amount });
            true
        }
    }

    #[abi(embed_v0)]
    impl MintableImpl of crate::interfaces::ierc20_simple::IERC20Mintable<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            self.total_supply.write(self.total_supply.read() + amount);
            self.balances.write(to, self.balances.read(to) + amount);
            self.emit(Transfer { 
                from: starknet::contract_address_const::<0>(), 
                to, 
                value: amount 
            });
        }
    }

    #[abi(embed_v0)]
    impl WrappedNativeImpl of crate::interfaces::iwrapped_native_simple::IWrappedNative<ContractState> {
        fn deposit(ref self: ContractState) {
            let caller = starknet::get_caller_address();
            let amount = 1000000000000000000_u256; // 1 ETH equivalent
            self.total_supply.write(self.total_supply.read() + amount);
            self.balances.write(caller, self.balances.read(caller) + amount);
            self.emit(Transfer { 
                from: starknet::contract_address_const::<0>(), 
                to: caller, 
                value: amount 
            });
            self.emit(Deposit { dst: caller, wad: amount });
        }

        fn withdraw(ref self: ContractState, wad: u256) {
            let caller = starknet::get_caller_address();
            let balance = self.balances.read(caller);
            assert!(balance >= wad, "Insufficient balance");
            self.balances.write(caller, balance - wad);
            self.total_supply.write(self.total_supply.read() - wad);
            self.emit(Transfer { 
                from: caller, 
                to: starknet::contract_address_const::<0>(), 
                value: wad 
            });
            self.emit(Withdrawal { src: caller, wad });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _transfer(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            amount: u256
        ) {
            let from_balance = self.balances.read(from);
            assert!(from_balance >= amount, "ERC20: transfer amount exceeds balance");
            self.balances.write(from, from_balance - amount);
            self.balances.write(to, self.balances.read(to) + amount);
            self.emit(Transfer { from, to, value: amount });
        }
    }
}