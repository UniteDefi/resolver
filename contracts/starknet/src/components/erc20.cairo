use starknet::ContractAddress;

#[starknet::component]
pub mod ERC20Component {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess
    };

    #[storage]
    pub struct Storage {
        name: felt252,
        symbol: felt252,
        decimals: u8,
        total_supply: u256,
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
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

    #[embeddable_as(ERC20Impl)]
    impl ERC20<
        TContractState, +HasComponent<TContractState>
    > of crate::interfaces::ierc20::IERC20<ComponentState<TContractState>> {
        fn name(self: @ComponentState<TContractState>) -> felt252 {
            self.name.read()
        }

        fn symbol(self: @ComponentState<TContractState>) -> felt252 {
            self.symbol.read()
        }

        fn decimals(self: @ComponentState<TContractState>) -> u8 {
            self.decimals.read()
        }

        fn total_supply(self: @ComponentState<TContractState>) -> u256 {
            self.total_supply.read()
        }

        fn balance_of(self: @ComponentState<TContractState>, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn allowance(
            self: @ComponentState<TContractState>, owner: ContractAddress, spender: ContractAddress
        ) -> u256 {
            self.allowances.read((owner, spender))
        }

        fn transfer(ref self: ComponentState<TContractState>, to: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self._transfer(caller, to, amount);
            true
        }

        fn transfer_from(
            ref self: ComponentState<TContractState>,
            from: ContractAddress,
            to: ContractAddress,
            amount: u256
        ) -> bool {
            let caller = get_caller_address();
            self._spend_allowance(from, caller, amount);
            self._transfer(from, to, amount);
            true
        }

        fn approve(ref self: ComponentState<TContractState>, spender: ContractAddress, amount: u256) -> bool {
            let caller = get_caller_address();
            self._approve(caller, spender, amount);
            true
        }
    }

    #[embeddable_as(ERC20MintableImpl)]
    impl ERC20Mintable<
        TContractState, +HasComponent<TContractState>
    > of crate::interfaces::ierc20::IERC20Mintable<ComponentState<TContractState>> {
        fn mint(ref self: ComponentState<TContractState>, to: ContractAddress, amount: u256) {
            self._mint(to, amount);
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>
    > of InternalTrait<TContractState> {
        fn initializer(
            ref self: ComponentState<TContractState>,
            name: felt252,
            symbol: felt252,
            decimals: u8
        ) {
            self.name.write(name);
            self.symbol.write(symbol);
            self.decimals.write(decimals);
        }

        fn _transfer(
            ref self: ComponentState<TContractState>,
            from: ContractAddress,
            to: ContractAddress,
            amount: u256
        ) {
            assert(!from.is_zero(), 'ERC20: transfer from 0');
            assert(!to.is_zero(), 'ERC20: transfer to 0');

            let from_balance = self.balances.read(from);
            assert(from_balance >= amount, 'ERC20: transfer amount exceeds balance');

            self.balances.write(from, from_balance - amount);
            self.balances.write(to, self.balances.read(to) + amount);

            self.emit(Transfer { from, to, value: amount });
        }

        fn _mint(ref self: ComponentState<TContractState>, to: ContractAddress, amount: u256) {
            assert(!to.is_zero(), 'ERC20: mint to 0');

            self.total_supply.write(self.total_supply.read() + amount);
            self.balances.write(to, self.balances.read(to) + amount);

            let zero_address = Zeroable::zero();
            self.emit(Transfer { from: zero_address, to, value: amount });
        }

        fn _approve(
            ref self: ComponentState<TContractState>,
            owner: ContractAddress,
            spender: ContractAddress,
            amount: u256
        ) {
            assert(!owner.is_zero(), 'ERC20: approve from 0');
            assert(!spender.is_zero(), 'ERC20: approve to 0');

            self.allowances.write((owner, spender), amount);
            self.emit(Approval { owner, spender, value: amount });
        }

        fn _spend_allowance(
            ref self: ComponentState<TContractState>,
            owner: ContractAddress,
            spender: ContractAddress,
            amount: u256
        ) {
            let current_allowance = self.allowances.read((owner, spender));
            if current_allowance != BoundedInt::max() {
                assert(current_allowance >= amount, 'ERC20: insufficient allowance');
                self._approve(owner, spender, current_allowance - amount);
            }
        }
    }
}