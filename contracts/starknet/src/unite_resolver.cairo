#[starknet::contract]
mod UniteResolver {
    use starknet::{ContractAddress, get_caller_address, contract_address_const};
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use super::interfaces::iescrow_factory::{IEscrowFactoryDispatcher, IEscrowFactoryDispatcherTrait};
    use super::interfaces::iunite_order_protocol::{IUniteOrderProtocolDispatcher, IUniteOrderProtocolDispatcherTrait};
    use super::interfaces::iorder_mixin::{IOrderMixinDispatcher, IOrderMixinDispatcherTrait, TakerTraits};
    use super::interfaces::iescrow::{IEscrowDispatcher, IEscrowDispatcherTrait};
    use super::interfaces::ibase_escrow::Immutables;
    use super::interfaces::iunite_order::Order;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl InternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        factory: ContractAddress,
        lop: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        SrcEscrowDeployed: SrcEscrowDeployed,
        DstEscrowDeployed: DstEscrowDeployed,
        PartialFillExecuted: PartialFillExecuted,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct SrcEscrowDeployed {
        #[key]
        escrow: ContractAddress,
        #[key]
        order_hash: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct DstEscrowDeployed {
        #[key]
        escrow: ContractAddress,
        #[key]
        order_hash: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct PartialFillExecuted {
        #[key]
        escrow: ContractAddress,
        #[key]
        order_hash: felt252,
        partial_amount: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        factory: ContractAddress,
        lop: ContractAddress,
        initial_owner: ContractAddress
    ) {
        self.ownable.initializer(initial_owner);
        self.factory.write(factory);
        self.lop.write(lop);
    }

    #[abi(embed_v0)]
    impl UniteResolverImpl of super::interfaces::iunite_resolver::IUniteResolver<ContractState> {
        fn deploy_src_compact_partial(
            ref self: ContractState,
            immutables: Immutables,
            order: Order,
            r: felt252,
            vs: felt252,
            amount: u256,
            partial_amount: u256
        ) {
            let factory = IEscrowFactoryDispatcher { contract_address: self.factory.read() };
            let lop = IOrderMixinDispatcher { contract_address: self.lop.read() };
            let sop = IUniteOrderProtocolDispatcher { contract_address: self.lop.read() };
            
            // Check if this is first fill for this order
            let order_hash = sop.hash_order(order);
            let existing_escrow_address = sop.get_escrow_address(order_hash);
            
            let escrow_address = if existing_escrow_address.is_zero() {
                // First resolver - create escrow
                factory.create_src_escrow_partial_for(immutables, partial_amount, get_caller_address())
            } else {
                // Subsequent resolvers - use existing escrow
                let returned_address = factory.create_src_escrow_partial_for(immutables, partial_amount, get_caller_address());
                assert(returned_address == existing_escrow_address, 'Escrow address mismatch');
                existing_escrow_address
            };
            
            // Set TakerTraits with target flag
            let taker_traits = TakerTraits { value: 1_u256 << 251 };
            
            // Encode escrow address as target in args
            let mut args = ArrayTrait::new();
            args.append(escrow_address.into());
            
            // Fill the order with partial amount
            lop.fill_order_args(order, r, vs, partial_amount, taker_traits, args);
            
            self.emit(SrcEscrowDeployed { escrow: escrow_address, order_hash: immutables.order_hash });
            self.emit(PartialFillExecuted { escrow: escrow_address, order_hash: immutables.order_hash, partial_amount });
        }

        fn deploy_dst_partial(
            ref self: ContractState,
            immutables: Immutables,
            src_cancellation_timestamp: u64,
            partial_amount: u256
        ) {
            let factory = IEscrowFactoryDispatcher { contract_address: self.factory.read() };
            
            // Deploy destination escrow with safety deposit
            let escrow_address = factory.create_dst_escrow_partial_for(
                immutables,
                src_cancellation_timestamp,
                partial_amount,
                get_caller_address()
            );
            
            // Transfer destination tokens to escrow
            let token = IERC20Dispatcher { contract_address: immutables.token };
            token.transfer_from(get_caller_address(), escrow_address, partial_amount);
            
            self.emit(DstEscrowDeployed { escrow: escrow_address, order_hash: immutables.order_hash });
            self.emit(PartialFillExecuted { escrow: escrow_address, order_hash: immutables.order_hash, partial_amount });
        }

        fn withdraw(
            ref self: ContractState,
            escrow_address: ContractAddress,
            secret: felt252,
            immutables: Immutables
        ) {
            let escrow = IEscrowDispatcher { contract_address: escrow_address };
            escrow.withdraw(secret, immutables);
        }

        fn withdraw_user(
            ref self: ContractState,
            escrow_address: ContractAddress,
            secret: felt252,
            immutables: Immutables
        ) {
            let escrow = IEscrowDispatcher { contract_address: escrow_address };
            escrow.withdraw_user(secret, immutables);
        }

        fn withdraw_resolver(
            ref self: ContractState,
            escrow_address: ContractAddress,
            secret: felt252,
            immutables: Immutables
        ) {
            let escrow = IEscrowDispatcher { contract_address: escrow_address };
            escrow.withdraw_resolver(secret, immutables);
        }

        fn cancel(
            ref self: ContractState,
            escrow_address: ContractAddress,
            immutables: Immutables
        ) {
            let escrow = IEscrowDispatcher { contract_address: escrow_address };
            escrow.cancel(immutables);
        }
    }
}
