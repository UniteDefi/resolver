#[starknet::contract]
mod UniteEscrow {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp, contract_address_const};
    use openzeppelin::security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use core::hash::{HashStateTrait, HashStateExTrait};
    use core::poseidon::PoseidonTrait;
    use super::interfaces::iescrow::IEscrow;
    use super::interfaces::ibase_escrow::{IBaseEscrow, Immutables};
    use super::libraries::timelocks_lib;

    component!(path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent);

    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        // State: 0=Active, 1=Withdrawn, 2=Cancelled
        state: u8,
        
        // Immutable storage
        order_hash: felt252,
        hashlock: felt252,
        maker: ContractAddress,
        taker: ContractAddress,
        token: ContractAddress,
        amount: u256,
        safety_deposit: u256,
        timelocks: u256,
        is_source: bool,
        src_cancellation_timestamp: u64,
        factory: ContractAddress,
        
        // Partial filling support
        resolver_partial_amounts: LegacyMap<ContractAddress, u256>,
        resolver_safety_deposits: LegacyMap<ContractAddress, u256>,
        resolver_withdrawn: LegacyMap<ContractAddress, bool>,
        resolvers: LegacyMap<u32, ContractAddress>,
        resolver_count: u32,
        total_partial_amount: u256,
        total_partial_withdrawn: u256,
        funds_distributed: bool,
        
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ResolverAdded: ResolverAdded,
        FundsDistributed: FundsDistributed,
        CallerRewarded: CallerRewarded,
        Withdrawn: Withdrawn,
        Cancelled: Cancelled,
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct ResolverAdded {
        #[key]
        resolver: ContractAddress,
        partial_amount: u256,
        safety_deposit: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct FundsDistributed {
        #[key]
        caller: ContractAddress,
        after_time_limit: bool,
    }

    #[derive(Drop, starknet::Event)]
    struct CallerRewarded {
        #[key]
        caller: ContractAddress,
        reward: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Withdrawn {
        #[key]
        recipient: ContractAddress,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Cancelled {
        #[key]
        maker: ContractAddress,
        amount: u256,
    }

    const CALLER_REWARD_PERCENTAGE: u256 = 10;

    #[constructor]
    fn constructor(
        ref self: ContractState,
        order_hash: felt252,
        hashlock: felt252,
        maker: ContractAddress,
        taker: ContractAddress,
        token: ContractAddress,
        amount_low: felt252,
        amount_high: felt252,
        safety_deposit_low: felt252,
        safety_deposit_high: felt252,
        timelocks_low: felt252,
        timelocks_high: felt252,
        is_source_flag: felt252,
        src_cancellation_timestamp: felt252,
    ) {
        self.state.write(0); // Active
        self.order_hash.write(order_hash);
        self.hashlock.write(hashlock);
        self.maker.write(maker);
        self.taker.write(taker);
        self.token.write(token);
        
        let amount = u256 { low: amount_low.try_into().unwrap(), high: amount_high.try_into().unwrap() };
        let safety_deposit = u256 { low: safety_deposit_low.try_into().unwrap(), high: safety_deposit_high.try_into().unwrap() };
        let timelocks = u256 { low: timelocks_low.try_into().unwrap(), high: timelocks_high.try_into().unwrap() };
        
        self.amount.write(amount);
        self.safety_deposit.write(safety_deposit);
        self.timelocks.write(timelocks);
        self.is_source.write(is_source_flag != 0);
        self.src_cancellation_timestamp.write(src_cancellation_timestamp.try_into().unwrap());
        self.factory.write(get_caller_address());
    }

    #[abi(embed_v0)]
    impl BaseEscrowImpl of IBaseEscrow<ContractState> {
        fn get_order_hash(self: @ContractState) -> felt252 {
            self.order_hash.read()
        }

        fn get_hashlock(self: @ContractState) -> felt252 {
            self.hashlock.read()
        }

        fn get_maker(self: @ContractState) -> ContractAddress {
            self.maker.read()
        }

        fn get_taker(self: @ContractState) -> ContractAddress {
            self.taker.read()
        }

        fn get_token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }

        fn get_amount(self: @ContractState) -> u256 {
            self.amount.read()
        }

        fn get_safety_deposit(self: @ContractState) -> u256 {
            self.safety_deposit.read()
        }

        fn get_timelocks(self: @ContractState) -> u256 {
            self.timelocks.read()
        }

        fn get_state(self: @ContractState) -> u8 {
            self.state.read()
        }
    }

    #[abi(embed_v0)]
    impl EscrowImpl of IEscrow<ContractState> {
        fn withdraw_with_secret(ref self: ContractState, secret: felt252, immutables: Immutables) {
            self.reentrancy_guard.start();
            
            // Verify state is active
            assert(self.state.read() == 0, 'Not active');
            
            // Verify secret
            let mut state = PoseidonTrait::new();
            state = state.update(secret);
            let computed_hash = state.finalize();
            assert(computed_hash == self.hashlock.read(), 'Invalid secret');
            
            // Verify immutables
            self._verify_immutables(@immutables);
            
            // Prevent double withdrawal
            assert(!self.funds_distributed.read(), 'Already withdrawn');
            
            let current_time = get_block_timestamp();
            let deployed_at = timelocks_lib::get_deployed_at(self.timelocks.read());
            
            // Calculate caller reward if applicable
            let mut caller_reward: u256 = 0;
            let is_after_time_limit = if self.is_source.read() {
                let public_withdrawal_time = deployed_at + timelocks_lib::src_public_withdrawal(self.timelocks.read());
                current_time >= public_withdrawal_time.into()
            } else {
                let public_withdrawal_time = deployed_at + timelocks_lib::dst_public_withdrawal(self.timelocks.read());
                current_time >= public_withdrawal_time.into()
            };
            
            self.funds_distributed.write(true);
            
            if self.is_source.read() {
                self._distribute_source_funds(caller_reward);
            } else {
                self._distribute_destination_funds(caller_reward);
            }
            
            if caller_reward > 0 {
                // Send reward to caller (simplified - in practice handle ETH transfers)
                self.emit(CallerRewarded { caller: get_caller_address(), reward: caller_reward });
            }
            
            self.state.write(1); // Withdrawn
            self.emit(FundsDistributed { caller: get_caller_address(), after_time_limit: is_after_time_limit });
            
            self.reentrancy_guard.end();
        }

        fn withdraw(ref self: ContractState, secret: felt252, immutables: Immutables) {
            self.withdraw_with_secret(secret, immutables);
        }

        fn withdraw_user(ref self: ContractState, secret: felt252, immutables: Immutables) {
            self.withdraw_with_secret(secret, immutables);
        }

        fn withdraw_resolver(ref self: ContractState, secret: felt252, immutables: Immutables) {
            self.withdraw_with_secret(secret, immutables);
        }

        fn cancel(ref self: ContractState, immutables: Immutables) {
            self.reentrancy_guard.start();
            
            assert(self.state.read() == 0, 'Not active');
            self._verify_immutables(@immutables);
            
            let current_time = get_block_timestamp();
            let deployed_at = timelocks_lib::get_deployed_at(self.timelocks.read());
            
            if self.is_source.read() {
                let cancellation_time = deployed_at + timelocks_lib::src_cancellation(self.timelocks.read());
                let public_cancellation_time = deployed_at + timelocks_lib::src_public_cancellation(self.timelocks.read());
                
                assert(current_time >= cancellation_time.into(), 'Invalid time');
                if current_time < public_cancellation_time.into() {
                    assert(get_caller_address() == self.maker.read(), 'Invalid caller');
                }
            } else {
                assert(current_time >= self.src_cancellation_timestamp.read().into(), 'Invalid time');
                let cancellation_time = deployed_at + timelocks_lib::dst_cancellation(self.timelocks.read());
                assert(current_time >= cancellation_time.into(), 'Invalid time');
            }
            
            self.state.write(2); // Cancelled
            
            // Return funds to maker and safety deposits to resolvers
            self.emit(Cancelled { maker: self.maker.read(), amount: self.amount.read() });
            
            self.reentrancy_guard.end();
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _verify_immutables(self: @ContractState, immutables: @Immutables) {
            assert(*immutables.order_hash == self.order_hash.read(), 'Invalid order hash');
            assert(*immutables.hashlock == self.hashlock.read(), 'Invalid hashlock');
            assert(*immutables.maker == self.maker.read(), 'Invalid maker');
            assert(*immutables.taker == self.taker.read(), 'Invalid taker');
            assert(*immutables.token == self.token.read(), 'Invalid token');
            assert(*immutables.amount == self.amount.read(), 'Invalid amount');
            assert(*immutables.safety_deposit == self.safety_deposit.read(), 'Invalid safety deposit');
        }

        fn _distribute_source_funds(ref self: ContractState, caller_reward: u256) {
            // Distribute tokens proportionally to resolvers
            let resolver_count = self.resolver_count.read();
            let mut i: u32 = 0;
            
            loop {
                if i >= resolver_count {
                    break;
                }
                
                let resolver = self.resolvers.read(i);
                let resolver_amount = self.resolver_partial_amounts.read(resolver);
                let resolver_deposit = self.resolver_safety_deposits.read(resolver);
                
                // Transfer tokens to resolver (simplified)
                self.emit(Withdrawn { recipient: resolver, amount: resolver_amount });
                
                i += 1;
            }
        }

        fn _distribute_destination_funds(ref self: ContractState, caller_reward: u256) {
            // Send all tokens to user (maker)
            let total_amount = self.total_partial_amount.read();
            self.emit(Withdrawn { recipient: self.maker.read(), amount: total_amount });
            
            // Return safety deposits to resolvers
            let resolver_count = self.resolver_count.read();
            let mut i: u32 = 0;
            
            loop {
                if i >= resolver_count {
                    break;
                }
                
                let resolver = self.resolvers.read(i);
                // Return safety deposit (simplified)
                
                i += 1;
            }
        }
    }
}
