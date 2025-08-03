#[starknet::contract]
mod UniteEscrowFactory {
    use starknet::{
        ContractAddress, get_caller_address, get_contract_address, ClassHash,
        deploy_syscall, Felt252TryIntoContractAddress, contract_address_const
    };
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use crate::interfaces::iescrow_factory::IEscrowFactory;
    use crate::interfaces::ibase_escrow::Immutables;
    use crate::libraries::immutables_lib;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl InternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        escrow_class_hash: ClassHash,
        src_escrows: LegacyMap<felt252, ContractAddress>,
        dst_escrows: LegacyMap<felt252, ContractAddress>,
        resolver_partial_amounts: LegacyMap<(felt252, ContractAddress), u256>,
        resolver_safety_deposits: LegacyMap<(felt252, ContractAddress), u256>,
        total_filled_amounts: LegacyMap<felt252, u256>,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        EscrowCreated: EscrowCreated,
        ResolverAdded: ResolverAdded,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct EscrowCreated {
        #[key]
        escrow: ContractAddress,
        #[key]
        order_hash: felt252,
        is_source: bool,
    }

    #[derive(Drop, starknet::Event)]
    struct ResolverAdded {
        #[key]
        escrow: ContractAddress,
        #[key]
        resolver: ContractAddress,
        amount: u256,
        safety_deposit: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState, initial_owner: ContractAddress, escrow_class_hash: ClassHash) {
        self.ownable.initializer(initial_owner);
        self.escrow_class_hash.write(escrow_class_hash);
    }

    #[abi(embed_v0)]
    impl EscrowFactoryImpl of IEscrowFactory<ContractState> {
        fn address_of_escrow_src(self: @ContractState, immutables: Immutables) -> ContractAddress {
            let salt = immutables_lib::hash_immutables(@immutables);
            let class_hash = self.escrow_class_hash.read();
            
            // Calculate CREATE2-style address (simplified for StarkNet)
            // In practice, you'd use proper address calculation
            let constructor_calldata = array![salt];
            
            // This is a placeholder - in real implementation, use starknet::get_contract_address
            contract_address_const::<0x123>()
        }

        fn address_of_escrow_dst(self: @ContractState, immutables: Immutables) -> ContractAddress {
            let salt = immutables_lib::hash_immutables(@immutables);
            
            // Use different salt for destination escrows
            let mut dst_salt_data = ArrayTrait::new();
            dst_salt_data.append('DST');
            dst_salt_data.append(salt);
            
            contract_address_const::<0x456>()
        }

        fn create_src_escrow(ref self: ContractState, immutables: Immutables) -> ContractAddress {
            self.create_src_escrow_partial(immutables, immutables.amount)
        }

        fn create_dst_escrow(ref self: ContractState, immutables: Immutables, src_cancellation_timestamp: u64) -> ContractAddress {
            self.create_dst_escrow_partial(immutables, src_cancellation_timestamp, immutables.amount)
        }

        fn create_src_escrow_partial(ref self: ContractState, immutables: Immutables, partial_amount: u256) -> ContractAddress {
            self.create_src_escrow_partial_for(immutables, partial_amount, get_caller_address())
        }

        fn create_dst_escrow_partial(ref self: ContractState, immutables: Immutables, src_cancellation_timestamp: u64, partial_amount: u256) -> ContractAddress {
            self.create_dst_escrow_partial_for(immutables, src_cancellation_timestamp, partial_amount, get_caller_address())
        }

        fn create_src_escrow_partial_for(
            ref self: ContractState,
            immutables: Immutables,
            partial_amount: u256,
            resolver: ContractAddress
        ) -> ContractAddress {
            assert(partial_amount > 0 && partial_amount <= immutables.amount, 'Invalid amount');
            
            // Calculate proportional safety deposit
            let required_safety_deposit = (immutables.safety_deposit * partial_amount) / immutables.amount;
            
            // Check if resolver already participated
            let existing_amount = self.resolver_partial_amounts.read((immutables.order_hash, resolver));
            assert(existing_amount == 0, 'Resolver already exists');
            
            let order_hash = immutables.order_hash;
            let mut escrow_address = self.src_escrows.read(order_hash);
            
            if escrow_address.is_zero() {
                // First resolver - deploy escrow
                let class_hash = self.escrow_class_hash.read();
                let salt = immutables_lib::hash_immutables(@immutables);
                
                let constructor_calldata = array![
                    immutables.order_hash,
                    immutables.hashlock,
                    immutables.maker.into(),
                    immutables.taker.into(),
                    immutables.token.into(),
                    immutables.amount.low.into(),
                    immutables.amount.high.into(),
                    immutables.safety_deposit.low.into(),
                    immutables.safety_deposit.high.into(),
                    immutables.timelocks.low.into(),
                    immutables.timelocks.high.into(),
                    1_felt252, // is_source = true
                ];
                
                let (deployed_address, _) = deploy_syscall(
                    class_hash,
                    salt,
                    constructor_calldata.span(),
                    false
                ).unwrap();
                
                escrow_address = deployed_address;
                self.src_escrows.write(order_hash, escrow_address);
                
                self.emit(EscrowCreated {
                    escrow: escrow_address,
                    order_hash,
                    is_source: true,
                });
            }
            
            // Track resolver participation
            self.resolver_partial_amounts.write((order_hash, resolver), partial_amount);
            self.resolver_safety_deposits.write((order_hash, resolver), required_safety_deposit);
            
            let current_total = self.total_filled_amounts.read(order_hash);
            self.total_filled_amounts.write(order_hash, current_total + partial_amount);
            
            self.emit(ResolverAdded {
                escrow: escrow_address,
                resolver,
                amount: partial_amount,
                safety_deposit: required_safety_deposit,
            });
            
            escrow_address
        }

        fn create_dst_escrow_partial_for(
            ref self: ContractState,
            immutables: Immutables,
            src_cancellation_timestamp: u64,
            partial_amount: u256,
            resolver: ContractAddress
        ) -> ContractAddress {
            assert(partial_amount > 0 && partial_amount <= immutables.amount, 'Invalid amount');
            
            let required_safety_deposit = (immutables.safety_deposit * partial_amount) / immutables.amount;
            
            let existing_amount = self.resolver_partial_amounts.read((immutables.order_hash, resolver));
            assert(existing_amount == 0, 'Resolver already exists');
            
            let order_hash = immutables.order_hash;
            let mut escrow_address = self.dst_escrows.read(order_hash);
            
            if escrow_address.is_zero() {
                // Deploy destination escrow
                let class_hash = self.escrow_class_hash.read();
                let salt = immutables_lib::hash_immutables(@immutables);
                
                let constructor_calldata = array![
                    immutables.order_hash,
                    immutables.hashlock,
                    immutables.maker.into(),
                    immutables.taker.into(),
                    immutables.token.into(),
                    immutables.amount.low.into(),
                    immutables.amount.high.into(),
                    immutables.safety_deposit.low.into(),
                    immutables.safety_deposit.high.into(),
                    immutables.timelocks.low.into(),
                    immutables.timelocks.high.into(),
                    0_felt252, // is_source = false
                    src_cancellation_timestamp.into(),
                ];
                
                let (deployed_address, _) = deploy_syscall(
                    class_hash,
                    salt,
                    constructor_calldata.span(),
                    false
                ).unwrap();
                
                escrow_address = deployed_address;
                self.dst_escrows.write(order_hash, escrow_address);
                
                self.emit(EscrowCreated {
                    escrow: escrow_address,
                    order_hash,
                    is_source: false,
                });
            }
            
            // Track resolver participation
            self.resolver_partial_amounts.write((order_hash, resolver), partial_amount);
            self.resolver_safety_deposits.write((order_hash, resolver), required_safety_deposit);
            
            let current_total = self.total_filled_amounts.read(order_hash);
            self.total_filled_amounts.write(order_hash, current_total + partial_amount);
            
            self.emit(ResolverAdded {
                escrow: escrow_address,
                resolver,
                amount: partial_amount,
                safety_deposit: required_safety_deposit,
            });
            
            escrow_address
        }

        fn get_resolver_partial_amount(self: @ContractState, order_hash: felt252, resolver: ContractAddress) -> u256 {
            self.resolver_partial_amounts.read((order_hash, resolver))
        }

        fn get_resolver_safety_deposit(self: @ContractState, order_hash: felt252, resolver: ContractAddress) -> u256 {
            self.resolver_safety_deposits.read((order_hash, resolver))
        }

        fn get_total_filled_amount(self: @ContractState, order_hash: felt252) -> u256 {
            self.total_filled_amounts.read(order_hash)
        }
    }
}
